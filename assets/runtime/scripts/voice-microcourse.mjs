import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeSpeechAudio} from './lib/normalize-speech-audio.mjs';
import {assertReviewed,validateTimeline} from './lib/validate-microcourse.mjs';
import {microcourseUnit} from './lib/microcourse-unit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
if(!process.argv[2])throw new Error('Explicit source lesson path required');
const source=resolve(root,process.argv[2]);
const sourceBytes=readFileSync(source);
const sourceHash=createHash('sha256').update(sourceBytes).digest('hex');
const lesson=JSON.parse(sourceBytes.toString('utf8'));
assertReviewed(lesson);
const env=process.env.KNOWLEDGE_TTS_ENV_FILE || resolve(root,'.env.local');
if(process.env.KNOWLEDGE_TTS_ENV_FILE&&!existsSync(env))throw new Error('Configured TTS environment file is missing');
for(const raw of (existsSync(env)?readFileSync(env,'utf8'):'').split(/\r?\n/)){
 const line=raw.trim();if(!line||line.startsWith('#')) continue;
 const split=line.indexOf('=');if(split<1) continue;
 const key=line.slice(0,split).trim();let val=line.slice(split+1).trim();
 if((val.startsWith('"')&&val.endsWith('"'))||(val.startsWith("'")&&val.endsWith("'")))val=val.slice(1,-1);
 if(!process.env[key])process.env[key]=val;
}
const required=(key)=>{if(!process.env[key])throw new Error(`Missing ${key}`);return process.env[key];};
const base=resolve(root,'public/microcourse');
const audioDir=resolve(base,`audio/${lesson.slug}`);mkdirSync(audioDir,{recursive:true});
const out=resolve(root,`out/grade7/semester1/${microcourseUnit(lesson)}/${lesson.slug}`);mkdirSync(out,{recursive:true});
const run=(args)=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args],{stdio:'pipe'});
const duration=(path)=>Number(execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',path],{encoding:'utf8'}).trim());

// The API streams concatenated JSON objects; braces inside strings are not delimiters.
function objects(raw){const found=[];let start=-1,depth=0,quoted=false,escape=false;
 for(let i=0;i<raw.length;i++){const c=raw[i];if(quoted){if(escape)escape=false;else if(c==='\\')escape=true;else if(c==='"')quoted=false;continue;}
 if(c==='"')quoted=true;else if(c==='{'){if(depth===0)start=i;depth++;}else if(c==='}'&&--depth===0)found.push(JSON.parse(raw.slice(start,i+1)));}return found;}
async function synth(cue){
 const speaker=cue.lang==='en'?(process.env.DOUBAO_TTS_ENGLISH_SPEAKER||required('DOUBAO_TTS_SPEAKER')):required('DOUBAO_TTS_SPEAKER');
 const model=cue.lang==='en'?(process.env.DOUBAO_TTS_ENGLISH_MODEL||process.env.DOUBAO_TTS_MODEL):process.env.DOUBAO_TTS_MODEL;
 const params={text:cue.text,speaker, ...(model?{model}:{}),audio_params:{format:'pcm',sample_rate:24000,speech_rate:cue.rate??(cue.lang==='en'?-10:0)},additions:JSON.stringify({explicit_language:cue.lang==='en'?'en':'zh-cn',enable_language_detector:false,silence_duration:0})};
 const hash=createHash('sha256').update(JSON.stringify(params)).digest('hex').slice(0,20);
 const wav=resolve(audioDir,`${hash}.wav`);
 if(!existsSync(wav)){
  const response=await fetch('https://openspeech.bytedance.com/api/v3/tts/unidirectional',{method:'POST',signal:AbortSignal.timeout(60000),headers:{'Content-Type':'application/json','X-Api-Key':required('DOUBAO_TTS_API_KEY'),'X-Api-Resource-Id':required('DOUBAO_TTS_RESOURCE_ID'),'X-Api-Request-Id':randomUUID()},body:JSON.stringify({user:{uid:`microcourse-${randomUUID()}`},req_params:params})});
  const messages=objects(await response.text());
  const pcm=Buffer.concat(messages.filter(m=>m.code===0&&m.data).map(m=>Buffer.from(m.data,'base64')));
  if(!response.ok||!messages.some(m=>m.code===20000000)||pcm.length<2400)throw new Error(`TTS rejected: HTTP ${response.status}; codes ${messages.map(m=>m.code).join(',')}`);
  const raw=resolve(audioDir,`${hash}.pcm`);writeFileSync(raw,pcm);
  run(['-f','s16le','-ar','24000','-ac','1','-i',raw,'-af','loudnorm=I=-18:TP=-3:LRA=7','-ar','48000',wav]);
 }
 const seconds=duration(wav);if(!Number.isFinite(seconds)||seconds<0.1)throw new Error('Empty voice cue');
 return {audio:`audio/${lesson.slug}/${hash}.wav`,audioDuration:seconds};
}
let frame=0;const scenes=[],cues=[];
for(const draft of lesson.scenes){
 const start=frame;frame+=5;const local=[];
 for(const spec of draft.voice){frame+=Math.round((spec.pauseBefore||0)*30);
  const audio=await synth(spec);const cue={...spec,...audio,startFrame:frame,endFrame:frame+Math.ceil(audio.audioDuration*30),scene:draft.id};
  if(spec.role==='answer')draft.answerFrame=frame-start;
  if(spec.role==='example')draft.exampleFrame=frame-start;
  local.push(cue);cues.push(cue);frame=cue.endFrame+4;
  console.log(`${draft.id}: ${spec.lang} ${spec.text}`);
 }
 frame=Math.max(frame+5,start+Math.round(draft.minDuration*30));
 scenes.push({...draft,startFrame:start,durationInFrames:frame-start,cues:local});
}
if(frame>70*30)throw new Error(`Narration ${frame/30}s exceeds 70s; edit script rather than speed it up`);
const total=frame/30;
const narration=resolve(audioDir,'narration.wav');
const inputs=cues.flatMap(c=>['-i',resolve(base,c.audio)]);
const filters=cues.map((c,i)=>`[${i}:a]adelay=${c.startFrame*1600}S:all=1[a${i}]`);
filters.push(`${cues.map((_,i)=>`[a${i}]`).join('')}amix=inputs=${cues.length}:normalize=0,apad,atrim=duration=${total}[voice]`);
run([...inputs,'-filter_complex',filters.join(';'),'-map','[voice]','-ar','48000',narration]);
const mix=resolve(audioDir,'mixed.wav');
run(['-i',narration,'-stream_loop','-1','-i',resolve(base,'assets/bgm.wav'),'-filter_complex',`[0:a]asplit=2[voice][side];[1:a]volume=0.055,afade=t=in:d=0.6,afade=t=out:st=${total-1}:d=1[music];[music][side]sidechaincompress=threshold=0.025:ratio=8:attack=15:release=350[ducked];[voice][ducked]amix=inputs=2:normalize=0,atrim=duration=${total}[mix]`,'-map','[mix]','-ar','48000',mix]);
const master=resolve(audioDir,'master.wav');
normalizeSpeechAudio({input:mix,output:master,targetIntegratedLufs:-16,targetTruePeakDbtp:-3.2,maximumTruePeakDbtp:-3});
if(createHash('sha256').update(readFileSync(source)).digest('hex')!==sourceHash)throw new Error('Source changed during voice generation; rerun using cached cues');
const runtime={...lesson,scenes,cues,durationInFrames:frame,fps:30,audio:`audio/${lesson.slug}/master.wav`,sourceHash};
validateTimeline(runtime);
writeFileSync(resolve(base,`${lesson.slug}.json`),JSON.stringify(runtime,null,2)+'\n');
writeFileSync(resolve(out,'script.json'),JSON.stringify(runtime,null,2)+'\n');
writeFileSync(resolve(out,'metadata.json'),JSON.stringify(lesson.metadata,null,2)+'\n');
const stamp=(f)=>{const ms=Math.round(f*1000/30);return `${String(Math.floor(ms/3600000)).padStart(2,'0')}:${String(Math.floor(ms/60000)%60).padStart(2,'0')}:${String(Math.floor(ms/1000)%60).padStart(2,'0')},${String(ms%1000).padStart(3,'0')}`;};
writeFileSync(resolve(out,`${lesson.slug}.srt`),cues.map((c,i)=>`${i+1}\n${stamp(c.startFrame)} --> ${stamp(c.endFrame)}\n${c.text}\n`).join('\n'));
console.log(`READY: ${lesson.slug}, ${total.toFixed(2)} seconds, ${cues.length} synchronized cues`);
