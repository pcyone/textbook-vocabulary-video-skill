import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {validateLesson,verifyEpisode,deliver,main} from '../scripts/workflow.mjs';

const slug='u2-21-presentation',unit='unit02';
const sha=data=>createHash('sha256').update(data).digest('hex');
function fixture(t){
 const root=mkdtempSync(resolve(tmpdir(),'vocabulary-skill-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const source=resolve(root,`data/grade7/semester1/${unit}/${slug}.json`),out=resolve(root,`out/grade7/semester1/${unit}/${slug}`),pub=resolve(root,'public/microcourse');
 mkdirSync(resolve(source,'..'),{recursive:true});mkdirSync(out,{recursive:true});mkdirSync(pub,{recursive:true});
 const lesson=JSON.parse(readFileSync(new URL('../assets/lesson.example.json',import.meta.url),'utf8'));
 lesson.needsReview=false;lesson.review={status:'reviewed'};lesson.styleApproval={reference:'test-only-approved'};
 const save=(path,data)=>writeFileSync(path,JSON.stringify(data));save(source,lesson);
 const cues=[{lang:'zh',text:'问题',startFrame:1010,endFrame:1040},{lang:'zh',text:'答案',role:'answer',startFrame:1130,endFrame:1160}];
 const runtime={...lesson,sourceHash:sha(readFileSync(source)),durationInFrames:1800,cues,scenes:[{id:'quiz',startFrame:1000,answerFrame:130,cues}]};
 const saveRuntime=()=>{save(resolve(out,'script.json'),runtime);save(resolve(pub,`${slug}.json`),runtime);};saveRuntime();
 writeFileSync(resolve(out,`${slug}.mp4`),'unit-test-fixture-not-real-video');writeFileSync(resolve(out,`${slug}.srt`),'1\n00:00:01,000 --> 00:00:02,000\nTest');writeFileSync(resolve(out,'视频号发布文案.md'),'# Test publication copy');
 const qa={status:'PASS',contentReview:'PASS',fullDecode:'PASS',duration:60,width:1080,height:1920,fps:30,layoutSamples:9,pixelSamples:60,minPixelVariance:50,sourceHash:runtime.sourceHash,sha256:sha(readFileSync(resolve(out,`${slug}.mp4`)))};
 const audio={status:'PASS',cues:2,loudness:{integratedLufs:-16,truePeakDbtp:-3.2},checks:cues.map(c=>({text:c.text,lang:c.lang,rmsDb:-20}))};
 save(resolve(out,'qa-report.json'),qa);save(resolve(out,'audio-qa.json'),audio);
 return {root,source,out,lesson,runtime,qa,audio,save,saveRuntime};
}
test('valid technical evidence and exact-scope delivery',t=>{
 const f=fixture(t);assert.equal(verifyEpisode(f.root,unit,slug).quizPauseSeconds,3);
 const dest=resolve(f.root,'delivery');const result=deliver(f.root,unit,[slug],dest,true);
 assert.equal(result.count,1);assert.equal(result.published,false);assert.ok(existsSync(resolve(dest,'EP21 presentation.mp4')));
 assert.throws(()=>deliver(f.root,unit,[slug],dest,true),/already exists/);
});
test('unreviewed draft and unit collisions are rejected',t=>{
 const f=fixture(t);f.lesson.needsReview=true;assert.throws(()=>validateLesson(f.lesson,unit,slug),/review/);
 f.lesson.needsReview=false;assert.throws(()=>validateLesson(f.lesson,'unit03',slug),/identity/);
});
test('stale source or tampered video cannot pass',t=>{
 const f=fixture(t);writeFileSync(f.source,readFileSync(f.source,'utf8')+' ');assert.throws(()=>verifyEpisode(f.root,unit,slug),/Stale source/);
 f.save(f.source,f.lesson);writeFileSync(resolve(f.out,`${slug}.mp4`),'changed');assert.throws(()=>verifyEpisode(f.root,unit,slug),/checksum/);
});
test('quiz pause and synchronized answer are required',t=>{
 const f=fixture(t);f.runtime.scenes[0].answerFrame=120;f.saveRuntime();assert.throws(()=>verifyEpisode(f.root,unit,slug),/timing/);
});
test('audio loudness or mismatched cue evidence fails',t=>{
 const f=fixture(t);f.audio.loudness.integratedLufs=-30;f.save(resolve(f.out,'audio-qa.json'),f.audio);assert.throws(()=>verifyEpisode(f.root,unit,slug),/Loudness/);
 f.audio.loudness.integratedLufs=-16;f.audio.checks[0].text='stale';f.save(resolve(f.out,'audio-qa.json'),f.audio);assert.throws(()=>verifyEpisode(f.root,unit,slug),/cue QA/);
});
test('visual gate and missing later episode create no delivery',t=>{
 const f=fixture(t),dest=resolve(f.root,'delivery');assert.throws(()=>deliver(f.root,unit,[slug],dest,false),/storyboard/);
 assert.throws(()=>deliver(f.root,unit,[slug,'u2-22-mood'],dest,true),/Missing file/);assert.equal(existsSync(dest),false);
});
test('explicit safe scope and language split are enforced',t=>{
 const f=fixture(t);assert.throws(()=>main(['verify','--project',f.root,'--unit',unit]),/explicit/);
 assert.throws(()=>main(['verify','--project',f.root,'--unit',unit,'../escape']),/Unknown/);
 f.lesson.scenes[0].voice=[{lang:'zh',text:'学习 presentation'}];assert.throws(()=>validateLesson(f.lesson,unit,slug),/Chinese cue/);
});
