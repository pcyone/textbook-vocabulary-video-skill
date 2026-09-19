import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {analyzeSpeechLoudness} from './lib/normalize-speech-audio.mjs';
import {microcourseUnit} from './lib/microcourse-unit.mjs';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
for(const slug of process.argv.slice(2)){
 if(!/^(?:u\d+-)?\d{2}-[a-z-]+$/.test(slug))throw new Error('Invalid slug');
 const lesson=JSON.parse(readFileSync(resolve(root,`public/microcourse/${slug}.json`),'utf8'));
 const checks=[];
 for(const cue of lesson.cues){
  const pcm=execFileSync('ffmpeg',['-v','error','-i',resolve(root,'public/microcourse',cue.audio),'-f','f32le','-ac','1','-ar','8000','-']);
  let sum=0;for(let i=0;i<pcm.length;i+=4)sum+=pcm.readFloatLE(i)**2;
  const rmsDb=10*Math.log10(sum/(pcm.length/4));if(!Number.isFinite(rmsDb)||rmsDb< -45)throw new Error(`${slug}: silent cue ${cue.text}`);
  checks.push({text:cue.text,lang:cue.lang,rmsDb});
 }
 const loudness=analyzeSpeechLoudness(resolve(root,'public/microcourse',lesson.audio));
 if(Math.abs(loudness.integratedLufs+16)>.5||loudness.truePeakDbtp> -2)throw new Error(`${slug}: loudness out of range`);
 const report={status:'PASS',slug,cues:checks.length,loudness,checks,sourceHash:lesson.sourceHash,masterHash:createHash('sha256').update(readFileSync(resolve(root,'public/microcourse',lesson.audio))).digest('hex')};
 writeFileSync(resolve(root,`out/grade7/semester1/${microcourseUnit(lesson)}/${slug}/audio-qa.json`),JSON.stringify(report,null,2)+'\n');
 console.log(`${slug}: ${checks.length} cues PASS, ${loudness.integratedLufs} LUFS, ${loudness.truePeakDbtp} dBTP`);
}
