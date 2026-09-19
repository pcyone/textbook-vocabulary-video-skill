import {readFileSync,existsSync,statSync,mkdirSync,copyFileSync,writeFileSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {resolve,relative,isAbsolute,sep} from 'node:path';
import {pathToFileURL} from 'node:url';

const sceneIds=['hook','word','memory','family','collocation','example','exam','quiz','ending'];
const slugPattern=/^(?:u\d+-)?\d{2}-[a-z-]+$/;
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const ensure=(value,message)=>{if(!value)throw new Error(message);};
function localFile(root,name){
 ensure(typeof name==='string'&&name&&!isAbsolute(name),'Expected project-relative file');
 const file=resolve(root,name),rel=relative(root,file);
 ensure(rel!=='..'&&!rel.startsWith(`..${sep}`)&&!isAbsolute(rel),'Path escapes project');
 ensure(existsSync(file)&&statSync(file).isFile(),`Missing file: ${name}`);
 const actual=relative(realpathSync(root),realpathSync(file));
 ensure(actual!=='..'&&!actual.startsWith(`..${sep}`)&&!isAbsolute(actual),'Symlink escapes project');
 return file;
}
export function validateLesson(lesson,unit,slug){
 ensure(/^unit\d{2}$/.test(unit)&&slugPattern.test(slug),'Invalid unit or slug');
 ensure(lesson.slug===slug&&lesson.unitId===unit,'Lesson identity mismatch');
 const episode=slug.match(/(?:^|-)(\d{2})-/)?.[1];
 ensure(lesson.id===`EP${episode}`,'Episode identity mismatch');
 if(unit!=='unit01')ensure(slug.startsWith(`u${Number(unit.slice(4))}-`),'Missing matching unit prefix');
 ensure(lesson.needsReview===false&&lesson.review?.status==='reviewed','Content review required');
 ensure(lesson.templateId==='vocabulary-microcourse-v1','Unsupported template');
 ensure(lesson.styleApproval?.reference,'Style approval reference required');
 ensure(lesson.word&&/^\/[^/\n]+\/$/.test(lesson.ipa),'Missing word or IPA');
 ensure(Array.isArray(lesson.quiz?.options)&&lesson.quiz.options.length===3&&Number.isInteger(lesson.quiz.answer)&&lesson.quiz.answer>=0&&lesson.quiz.answer<3,'Invalid quiz answer');
 ensure(Array.isArray(lesson.family)&&lesson.family.length>0&&lesson.family.length<=4,'Invalid family count');
 for(const item of lesson.family)ensure((item.placement==='prefix'?item.change+item.base:item.base+item.change)===item.word,'Invalid word-form construction');
 ensure(JSON.stringify(lesson.scenes?.map(s=>s.id))===JSON.stringify(sceneIds),'Expected nine ordered scenes');
 for(const scene of lesson.scenes){
  ensure(Number.isFinite(scene.minDuration)&&scene.minDuration>0&&scene.voice?.length,'Invalid scene');
  for(const cue of scene.voice){
   ensure(['en','zh'].includes(cue.lang)&&typeof cue.text==='string'&&cue.text.trim(),'Invalid cue');
   ensure(cue.lang!=='zh'||!/[A-Za-z]/.test(cue.text),'English text in Chinese cue');
  }
 }
 const quiz=lesson.scenes.find(s=>s.id==='quiz');
 ensure(quiz.voice.length===2&&quiz.voice[1].role==='answer'&&quiz.voice[1].pauseBefore>=3,'Three-second quiz pause required');
 ensure(lesson.scenes.find(s=>s.id==='example').voice.some(c=>c.lang==='en'&&c.role==='example'&&c.text===lesson.example.en),'Missing full English example cue');
 return lesson;
}
function paths(project,unit,slug){
 ensure(/^unit\d{2}$/.test(unit)&&slugPattern.test(slug),'Invalid unit or slug');
 const root=resolve(project),source=localFile(root,`data/grade7/semester1/${unit}/${slug}.json`);
 return {root,source,out:resolve(root,`out/grade7/semester1/${unit}/${slug}`)};
}
export function verifyEpisode(project,unit,slug){
 const {root,source,out}=paths(project,unit,slug);
 const lesson=validateLesson(read(source),unit,slug),qa=read(resolve(out,'qa-report.json')),audio=read(resolve(out,'audio-qa.json'));
 const runtime=read(resolve(out,'script.json')),current=read(localFile(root,`public/microcourse/${slug}.json`));
 ensure(JSON.stringify(runtime)===JSON.stringify(current),'Runtime outputs differ');
 const sourceHash=hash(source);
 ensure(qa.sourceHash===sourceHash&&runtime.sourceHash===sourceHash,'Stale source hash');
 for(const key of ['id','slug','unitId','quiz','example','image'])ensure(JSON.stringify(runtime[key])===JSON.stringify(lesson[key]),`Runtime mismatch: ${key}`);
 ensure(qa.status==='PASS'&&qa.contentReview==='PASS'&&qa.fullDecode==='PASS','Video QA failed');
 ensure(audio.status==='PASS','Audio QA failed');
 ensure(Number.isFinite(qa.duration)&&qa.duration>=45&&qa.duration<=70.15,'Duration outside delivery contract');
 ensure(qa.width===1080&&qa.height===1920&&qa.fps===30,'Wrong delivery dimensions');
 ensure(qa.layoutSamples>=9&&qa.pixelSamples>0&&Number.isFinite(qa.minPixelVariance)&&qa.minPixelVariance>=30,'Missing layout or blank-frame checks');
 ensure(Number.isInteger(runtime.durationInFrames)&&Math.abs(qa.duration-runtime.durationInFrames/30)<=0.15,'Timeline/video duration mismatch');
 const loud=audio.loudness;
 ensure(loud&&Number.isFinite(loud.integratedLufs)&&Math.abs(loud.integratedLufs+16)<=0.5&&Number.isFinite(loud.truePeakDbtp)&&loud.truePeakDbtp<=-2,'Loudness failed');
 ensure(audio.cues===runtime.cues?.length&&audio.checks?.length===audio.cues,'Audio cue count mismatch');
 runtime.cues.forEach((cue,i)=>{
  const checked=audio.checks[i];
  ensure(checked.text===cue.text&&checked.lang===cue.lang&&Number.isFinite(checked.rmsDb)&&checked.rmsDb>=-45,'Audio cue QA mismatch');
 });
 if(audio.sourceHash)ensure(audio.sourceHash===sourceHash,'Stale audio QA');
 if(audio.masterHash)ensure(audio.masterHash===hash(localFile(resolve(root,'public/microcourse'),runtime.audio)),'Stale master audio');
 const quiz=runtime.scenes.find(s=>s.id==='quiz'),first=quiz?.cues?.[0];
 const answer=quiz?.cues?.find(c=>c.role==='answer');
 const pause=(quiz?.startFrame+quiz?.answerFrame-first?.endFrame)/30;
 ensure(Number.isFinite(pause)&&pause>=3&&answer?.startFrame===quiz.startFrame+quiz.answerFrame,'Quiz answer timing failed');
 const video=localFile(out,`${slug}.mp4`),subtitle=localFile(out,`${slug}.srt`),copy=localFile(out,'视频号发布文案.md');
 ensure(statSync(video).size>0&&hash(video)===qa.sha256,'Video checksum mismatch');
 ensure(readFileSync(subtitle,'utf8').includes(' --> ')&&readFileSync(copy,'utf8').trim(),'Missing subtitles or publication copy');
 return {id:lesson.id,slug,title:lesson.title,duration:qa.duration,sha256:qa.sha256,sourceHash,quizPauseSeconds:pause,layoutSamples:qa.layoutSamples,audioCues:audio.cues,video,subtitle,copy};
}
export function deliver(project,unit,slugs,output,visualReviewed){
 ensure(visualReviewed,'Inspect every storyboard before delivery');
 ensure(slugs.length&&new Set(slugs).size===slugs.length,'Explicit unique episodes required');
 const entries=slugs.map(slug=>verifyEpisode(project,unit,slug));
 const target=resolve(output);
 ensure(!existsSync(target),'Delivery directory already exists; refusing overwrite');
 mkdirSync(target,{recursive:true});
 const copies=[];
 for(const entry of entries){
  const name=`${entry.id} ${entry.slug.replace(/^(?:u\d+-)?\d{2}-/,'')}`;
  for(const [key,ext] of [['video','.mp4'],['subtitle','.srt'],['copy',' 发布文案.md']]){
   const dest=resolve(target,name+ext),src=entry[key];copyFileSync(src,dest);
   ensure(hash(src)===hash(dest),`Copy verification failed: ${dest}`);entry[key]=dest;
  }
  copies.push(readFileSync(entry.copy,'utf8'));
  entry.status='COMPLETE';entry.storyboardVisualReview='PASS';
 }
 writeFileSync(resolve(target,'视频号发布文案汇总.md'),copies.join('\n---\n\n'));
 const report={status:'COMPLETE',unit,count:entries.length,published:false,totalSeconds:entries.reduce((n,e)=>n+e.duration,0),episodes:entries};
 writeFileSync(resolve(target,'交付检查.json'),JSON.stringify(report,null,2)+'\n');
 return report;
}
export function preflight(project,unit,slugs){
 const root=resolve(project);
 ensure(Number(process.versions.node.split('.')[0])>=22,'Node.js 22+ required');
 for(const program of ['ffmpeg','ffprobe'])execFileSync(program,['-version'],{stdio:'pipe'});
 for(const script of ['voice-microcourse.mjs','render-microcourse.mjs','check-microcourse-audio.mjs','run-microcourse-batch.mjs'])localFile(root,`scripts/${script}`);
 const require=createRequire(resolve(root,'package.json'));
 for(const name of ['react','remotion','@remotion/bundler','@remotion/renderer'])require.resolve(name);
 localFile(root,'public/microcourse/assets/bgm.wav');
 for(const slug of slugs){const {source}=paths(root,unit,slug);const lesson=validateLesson(read(source),unit,slug);localFile(resolve(root,'public/microcourse'),lesson.image);}
 const env=process.env.KNOWLEDGE_TTS_ENV_FILE||resolve(root,'.env.local');
 return {status:'PREFLIGHT_PASS',project:root,unit,slugs,ttsConfigPresent:existsSync(env)||Boolean(process.env.DOUBAO_TTS_API_KEY),ttsAuthentication:'not checked',browserAndFonts:'must verify during render'};
}
export function main(args){
 const [command,...rest]=args,values={},slugs=[];let visual=false;
 for(let i=0;i<rest.length;i++){
  const arg=rest[i];
  if(arg==='--visual-reviewed'){visual=true;continue;}
  if(['--project','--unit','--output'].includes(arg)){ensure(rest[i+1]&&!rest[i+1].startsWith('--'),`Missing ${arg}`);values[arg.slice(2)]=rest[++i];continue;}
  ensure(!arg.startsWith('-')&&slugPattern.test(arg),`Unknown argument: ${arg}`);slugs.push(arg);
 }
 const project=values.project||process.env.VOCABULARY_VIDEO_PROJECT;
 ensure(project&&values.unit&&slugs.length&&new Set(slugs).size===slugs.length,'Provide --project, --unit and explicit unique slugs');
 if(command==='check')return preflight(project,values.unit,slugs);
 if(command==='verify')return {status:'TECHNICAL_PASS',episodes:slugs.map(s=>verifyEpisode(project,values.unit,s)),visualReview:'still required'};
 if(command==='deliver'){ensure(values.output,'--output required');return deliver(project,values.unit,slugs,values.output,visual);}
 throw new Error('Use check, verify or deliver');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 try{console.log(JSON.stringify(main(process.argv.slice(2)),null,2));}
 catch(error){console.error(error.message);process.exitCode=1;}
}
