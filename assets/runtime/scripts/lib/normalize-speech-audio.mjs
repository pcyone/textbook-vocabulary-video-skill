import {execFileSync, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {mkdirSync, renameSync, rmSync} from 'node:fs';
import {dirname} from 'node:path';

export const DEFAULT_SPEECH_NORMALIZATION = Object.freeze({
  version: 'speech-loudness-v2',
  targetIntegratedLufs: -18,
  targetLra: 7,
  targetTruePeakDbtp: -3.2,
  maximumTruePeakDbtp: -3,
  integratedToleranceLu: 0.25,
  targetSampleRate: 48_000,
  compressor: {
    threshold: 0.50118723, // -6 dBFS: only soften the highest speech transients.
    ratio: 2.5,
    attackMs: 2,
    releaseMs: 80,
    knee: 2.82843,
  },
  limiterCandidatesDb: [-4, -5, -6, -7, -8, -9, -10, -11, -12, -13, -14, -15, -16, -17, -18, -19, -20, -21, -22, -23, -24],
});

function configWith(overrides = {}) {
  return {
    ...DEFAULT_SPEECH_NORMALIZATION,
    ...overrides,
    compressor: {
      ...DEFAULT_SPEECH_NORMALIZATION.compressor,
      ...(overrides.compressor ?? {}),
    },
    limiterCandidatesDb: overrides.limiterCandidatesDb
      ? [...overrides.limiterCandidatesDb]
      : [...DEFAULT_SPEECH_NORMALIZATION.limiterCandidatesDb],
  };
}

function parseJsonObjects(raw) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        try {
          objects.push(JSON.parse(raw.slice(start, index + 1)));
        } catch {
          // Ignore non-JSON ffmpeg transport fragments.
        }
        start = -1;
      }
    }
  }
  return objects;
}

export function createSpeechNormalizationSignature(options = {}) {
  return createHash('sha256')
    .update(JSON.stringify(configWith(options)))
    .digest('hex');
}

export function probeSpeechAudio(path) {
  const result = JSON.parse(execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=sample_rate,channels,duration_ts:format=duration',
      '-of', 'json',
      path,
    ],
    {encoding: 'utf8'},
  ));
  const stream = result.streams?.[0];
  const sampleRate = Number(stream?.sample_rate);
  const channels = Number(stream?.channels);
  const seconds = Number(result.format?.duration);
  const durationSamples = Number(stream?.duration_ts);
  if (
    !Number.isFinite(sampleRate) || sampleRate <= 0
    || !Number.isInteger(channels) || channels <= 0
    || !Number.isFinite(seconds) || seconds <= 0
  ) {
    throw new Error(`Cannot read audio duration: ${path}`);
  }
  return {
    sampleRate,
    channels,
    seconds,
    durationSamples: Number.isInteger(durationSamples) && durationSamples > 0
      ? durationSamples
      : Math.round(seconds * sampleRate),
  };
}

export function analyzeSpeechLoudness(path, options = {}) {
  const config = configWith(options);
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner', '-nostats', '-i', path,
      '-af', `loudnorm=I=${config.targetIntegratedLufs}:LRA=${config.targetLra}:TP=${config.targetTruePeakDbtp}:print_format=json`,
      '-f', 'null', '-',
    ],
    {encoding: 'utf8'},
  );
  if (result.status !== 0) {
    throw new Error(`Loudness analysis failed for ${path}: ${result.stderr?.trim() || 'unknown ffmpeg error'}`);
  }
  const measurement = parseJsonObjects(result.stderr)
    .findLast((entry) => Object.hasOwn(entry, 'input_i') && Object.hasOwn(entry, 'input_tp'));
  if (!measurement) throw new Error(`Loudness analysis returned no measurement for ${path}`);
  const parsed = {
    integratedLufs: Number(measurement.input_i),
    truePeakDbtp: Number(measurement.input_tp),
    lra: Number(measurement.input_lra),
    threshold: Number(measurement.input_thresh),
    targetOffset: Number(measurement.target_offset),
  };
  if (Object.values(parsed).some((value) => !Number.isFinite(value))) {
    throw new Error(`Loudness analysis returned invalid values for ${path}`);
  }
  return parsed;
}

export function isSpeechLoudnessCompliant(measurement, options = {}) {
  const config = configWith(options);
  return Math.abs(measurement.integratedLufs - config.targetIntegratedLufs)
      <= config.integratedToleranceLu
    && measurement.truePeakDbtp <= config.maximumTruePeakDbtp;
}

function isLinearNormalizationFeasible(measurement, config) {
  const gainNeeded = config.targetIntegratedLufs - measurement.integratedLufs;
  const availablePeakHeadroom = config.targetTruePeakDbtp - measurement.truePeakDbtp;
  return gainNeeded <= availablePeakHeadroom - 0.05;
}

function exactLengthFilter(durationSamples, config) {
  return `aresample=${config.targetSampleRate}:filter_size=64:phase_shift=10:dither_method=triangular,apad=whole_len=${durationSamples},atrim=end_sample=${durationSamples}`;
}

function conditionForLoudness({input, output, durationSamples, limiterDb, config}) {
  const {compressor} = config;
  const limit = 10 ** (limiterDb / 20);
  const filter = [
    `acompressor=threshold=${compressor.threshold}:ratio=${compressor.ratio}:attack=${compressor.attackMs}:release=${compressor.releaseMs}:knee=${compressor.knee}:detection=peak:link=average`,
    `alimiter=limit=${limit}:attack=3:release=60:level=false:latency=true`,
    exactLengthFilter(durationSamples, config),
  ].join(',');
  execFileSync(
    'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-af', filter, '-ar', String(config.targetSampleRate), '-ac', '1', '-c:a', 'pcm_s16le', output],
    {stdio: 'inherit'},
  );
}

function runMeasuredLoudnorm({input, output, durationSamples, measurement, config}) {
  const filter = [
    [
      `loudnorm=I=${config.targetIntegratedLufs}`,
      `LRA=${config.targetLra}`,
      `TP=${config.targetTruePeakDbtp}`,
      `measured_I=${measurement.integratedLufs}`,
      `measured_LRA=${measurement.lra}`,
      `measured_TP=${measurement.truePeakDbtp}`,
      `measured_thresh=${measurement.threshold}`,
      `offset=${measurement.targetOffset}`,
      'linear=true',
    ].join(':'),
    exactLengthFilter(durationSamples, config),
  ].join(',');
  execFileSync(
    'ffmpeg',
    ['-y', '-hide_banner', '-loglevel', 'error', '-i', input, '-af', filter, '-ar', String(config.targetSampleRate), '-ac', '1', '-c:a', 'pcm_s16le', output],
    {stdio: 'inherit'},
  );
}

/**
 * Normalize a mono PCM WAV without changing its sample count.
 *
 * The input may equal the output. A measured two-pass loudnorm is used when
 * peak headroom allows it. Otherwise the least-aggressive candidate from the
 * speech compressor/limiter ladder is selected before the measured pass.
 */
export function normalizeSpeechAudio({input, output, ...options}) {
  const config = configWith(options);
  const inputInfo = probeSpeechAudio(input);
  if (inputInfo.sampleRate !== config.targetSampleRate) {
    throw new Error(`Speech normalization expects ${config.targetSampleRate} Hz input, got ${inputInfo.sampleRate} Hz: ${input}`);
  }
  if (inputInfo.channels !== 1) {
    throw new Error(`Speech normalization expects mono input, got ${inputInfo.channels} channels: ${input}`);
  }
  mkdirSync(dirname(output), {recursive: true});
  const token = randomUUID();
  const temporaryOutput = `${output}.${token}.normalized.wav`;
  const conditionedOutput = `${output}.${token}.conditioned.wav`;
  let loudnormInput = input;
  let measurement = analyzeSpeechLoudness(input, config);
  let limiterDb = null;
  try {
    if (!isLinearNormalizationFeasible(measurement, config)) {
      for (const candidateDb of config.limiterCandidatesDb) {
        conditionForLoudness({
          input,
          output: conditionedOutput,
          durationSamples: inputInfo.durationSamples,
          limiterDb: candidateDb,
          config,
        });
        const candidateMeasurement = analyzeSpeechLoudness(conditionedOutput, config);
        if (isLinearNormalizationFeasible(candidateMeasurement, config)) {
          loudnormInput = conditionedOutput;
          measurement = candidateMeasurement;
          limiterDb = candidateDb;
          break;
        }
      }
      if (limiterDb === null) {
        throw new Error(`Cannot reach ${config.targetIntegratedLufs} LUFS without exceeding the true-peak ceiling: ${input}`);
      }
    }
    runMeasuredLoudnorm({
      input: loudnormInput,
      output: temporaryOutput,
      durationSamples: inputInfo.durationSamples,
      measurement,
      config,
    });
    const outputInfo = probeSpeechAudio(temporaryOutput);
    if (outputInfo.durationSamples !== inputInfo.durationSamples) {
      throw new Error(`Normalization changed duration (${inputInfo.durationSamples} -> ${outputInfo.durationSamples} samples): ${input}`);
    }
    const finalMeasurement = analyzeSpeechLoudness(temporaryOutput, config);
    if (!isSpeechLoudnessCompliant(finalMeasurement, config)) {
      throw new Error(
        `Normalization QA failed for ${input}: ${finalMeasurement.integratedLufs.toFixed(2)} LUFS, ${finalMeasurement.truePeakDbtp.toFixed(2)} dBTP`,
      );
    }
    renameSync(temporaryOutput, output);
    return {
      ...finalMeasurement,
      durationSamples: inputInfo.durationSamples,
      method: limiterDb === null ? 'two-pass-loudnorm' : 'speech-compressor-limiter-plus-two-pass-loudnorm',
      limiterDb,
    };
  } finally {
    rmSync(temporaryOutput, {force: true});
    rmSync(conditionedOutput, {force: true});
  }
}
