import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateTimeline} from './lib/validate-microcourse.mjs';
import {microcourseUnit} from './lib/microcourse-unit.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const slug=process.argv.find(a=>a.startsWith('--lesson='))?.split('=')[1]||'05-patient';
if(!/^[a-z0-9-]+$/.test(slug))throw new Error('Invalid lesson slug');
const lesson=JSON.parse(readFileSync(resolve(root,`public/microcourse/${slug}.json`),'utf8'));
validateTimeline(lesson);
const source=resolve(root,`data/grade7/semester1/${microcourseUnit(lesson)}/${slug}.json`);
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
if(lesson.sourceHash!==hash(source))throw new Error('Lesson changed: rebuild voice and timeline first');
if(lesson.needsReview!==false||lesson.review.status!=='reviewed')throw new Error('Needs content review');
if(!lesson.image||!existsSync(resolve(root,'public/microcourse',lesson.image)))throw new Error('Missing illustration');
if(!Number.isInteger(lesson.quiz.answer)||!lesson.quiz.options[lesson.quiz.answer])throw new Error('Invalid quiz answer');
if(lesson.durationInFrames<35*30||lesson.durationInFrames>70*30)throw new Error('Duration out of bounds');
for(const cue of lesson.cues){if(cue.endFrame<=cue.startFrame||cue.endFrame>lesson.durationInFrames||!existsSync(resolve(root,'public/microcourse',cue.audio)))throw new Error('Invalid audio cue');if(cue.lang==='zh'&&/[a-zA-Z]/.test(cue.text))throw new Error('English must use English TTS');}
const out=resolve(root,`out/grade7/semester1/${microcourseUnit(lesson)}/${slug}`),qaDir=resolve(out,'qa');mkdirSync(qaDir,{recursive:true});
const serveUrl=await bundle({entryPoint:resolve(root,'src/microcourse/index.tsx'),publicDir:resolve(root,'public/microcourse'),outDir:resolve(root,'build/microcourse')});
const browser=await openBrowser('chrome');
const reports=[];
try{
 const composition=await selectComposition({serveUrl,id:'VocabularyMicrocourse',inputProps:{lesson},puppeteerInstance:browser});
 const frameSet=new Set(lesson.scenes.map(s=>s.startFrame+s.durationInFrames-8));
 for(const s of lesson.scenes){frameSet.add(s.startFrame+15);if(s.answerFrame)frameSet.add(s.startFrame+s.answerFrame-45);}
 for(const cue of lesson.cues)frameSet.add(Math.min(cue.endFrame-1,cue.startFrame+15));
 const frames=[...frameSet].sort((a,b)=>a-b);
 const audits=new Map();
 for(const frame of frames){
  await renderStill({serveUrl,composition:{...composition,props:{lesson,qa:true}},inputProps:{lesson,qa:true},frame,output:resolve(qaDir,`frame-${String(frame).padStart(4,'0')}.png`),puppeteerInstance:browser,imageFormat:'png',onBrowserLog:log=>{const prefix='MICROCOURSE_QA ';const index=log.text.indexOf(prefix);if(index>=0){const data=JSON.parse(log.text.slice(index+prefix.length));audits.set(data.frame,data);}}});
  const audit=audits.get(frame);if(!audit)throw new Error(`Missing DOM audit frame ${frame}`);
  reports.push(audit);if(audit.errors.length)throw new Error(`Frame ${frame}: ${audit.errors.join(', ')}`);
 }
 writeFileSync(resolve(qaDir,'layout.json'),JSON.stringify({status:'PASS',sampleCount:reports.length,frames:reports},null,2));
 const overview=lesson.scenes.map(s=>resolve(qaDir,`frame-${String(s.startFrame+s.durationInFrames-8).padStart(4,'0')}.png`));
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...overview.flatMap(p=>['-i',p]),'-filter_complex',overview.map((_,i)=>`[${i}:v]scale=270:480[v${i}]`).join(';')+';'+overview.map((_,i)=>`[v${i}]`).join('')+'xstack=inputs=9:layout=0_0|270_0|540_0|0_480|270_480|540_480|0_960|270_960|540_960[out]','-map','[out]','-frames:v','1',resolve(out,'storyboard.jpg')]);
 console.log(`Layout PASS: ${reports.length} frames; storyboard.jpg ready`);
 if(process.argv.includes('--stills'))process.exitCode=0;
 else{
  const video=resolve(out,`${slug}.mp4`);let last=-1;
  await renderMedia({serveUrl,composition,inputProps:{lesson},outputLocation:video,codec:'h264',audioCodec:'aac',audioBitrate:'192k',sampleRate:48000,pixelFormat:'yuv420p',crf:19,x264Preset:'fast',colorSpace:'bt709',concurrency:4,puppeteerInstance:browser,onProgress:p=>{const n=Math.floor(p.progress*10);if(n>last){last=n;console.log(`Render ${n*10}%`);}}});
  execFileSync('ffmpeg',['-v','error','-i',video,'-f','null','-'],{stdio:'pipe'});
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',video],{encoding:'utf8'}));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
  if(v.width!==1080||v.height!==1920||v.avg_frame_rate!=='30/1'||v.codec_name!=='h264'||v.pix_fmt!=='yuv420p'||a?.codec_name!=='aac'||a.sample_rate!=='48000'||Math.abs(Number(probe.format.duration)-lesson.durationInFrames/30)>0.15)throw new Error('Output format or duration mismatch');
  const pixels=execFileSync('ffmpeg',['-v','error','-i',video,'-vf','fps=1,scale=48:84,format=gray','-f','rawvideo','-'],{maxBuffer:5e6});
  const variances=[];for(let p=0;p+4032<=pixels.length;p+=4032){const values=pixels.subarray(p,p+4032);const avg=values.reduce((s,x)=>s+x,0)/4032;variances.push(values.reduce((s,x)=>s+(x-avg)**2,0)/4032);}
  if(!variances.length||variances.some(v=>v<30))throw new Error('Blank-frame pixel check failed');
  const summary={status:'PASS',releaseStatus:'pilot-awaiting-style-review',video,sha256:hash(video),bytes:statSync(video).size,duration:Number(probe.format.duration),width:v.width,height:v.height,fps:30,fullDecode:'PASS',layoutSamples:reports.length,pixelSamples:variances.length,minPixelVariance:Math.min(...variances),contentReview:'PASS',subtitleTiming:'shared exact frame timeline with audio',sourceHash:lesson.sourceHash};
  writeFileSync(resolve(out,'qa-report.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary,null,2));
 }
} finally {await browser.close({silent:true});}
