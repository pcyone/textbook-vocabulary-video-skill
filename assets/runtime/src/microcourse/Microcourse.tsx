import React,{useLayoutEffect} from 'react';
import {AbsoluteFill,Audio,Img,Sequence,interpolate,spring,staticFile,useCurrentFrame,delayRender,continueRender} from 'remotion';
import type {Lesson,Scene} from './types';
import './microcourse.css';
import './extended.css';

const clamp={extrapolateLeft:'clamp' as const,extrapolateRight:'clamp' as const};
const appear=(frame:number,delay=0)=>({opacity:interpolate(frame-delay,[0,10],[0,1],clamp),transform:`translateY(${interpolate(frame-delay,[0,15],[18,0],clamp)}px)`});
function Word({word,frame}:{word:string;frame:number}){return <div data-qa="word" className="mc-word" style={{fontSize:Math.min(138,1100/word.length),transform:`scale(${0.92+0.08*spring({frame:Math.max(0,frame),fps:30,config:{damping:16}})})`}}><span className="mc-initial" style={{'--initial-opacity':interpolate(frame,[15,45],[1,.35],clamp)} as React.CSSProperties}>{word[0]}</span>{word.slice(1)}</div>;}
function Illustration({lesson,frame,compact=false}:{lesson:Lesson;frame:number;compact?:boolean}){return <div className={`mc-illustration ${compact?'compact':''}`}><Img src={staticFile(lesson.image)} style={{objectFit:lesson.imageFit??'cover',objectPosition:'center top',transformOrigin:'center top',transform:`scale(${interpolate(frame,[0,240],[1,1.035],clamp)})`}}/></div>;}
function Family({lesson,scene,frame}:{lesson:Lesson;scene:Scene;frame:number}){return <>
 <div className="mc-root-word" data-qa="family-root">{lesson.familyRoot??lesson.word}</div>
 <div className={`mc-tree ${lesson.family.length>3?'mc-tree-compact':''} ${lesson.familyMode==='categories'?'mc-categories':''}`}>
 {lesson.family.map((item,index)=>{
  const cue=scene.cues.find(c=>c.reveal===index);const from=cue?cue.startFrame-scene.startFrame:30+index*60;
  const t=frame-from;return <div className="mc-branch" key={`${index}-${item.word}`} style={appear(frame,from)}>
   <div className="mc-connector" style={{transform:`scaleX(${interpolate(t,[0,16],[0,1],clamp)})`}}/>
   <div data-qa={`family-${index}`} className={`mc-paper family-${index}`}>
    <div className="mc-family-word">{item.placement==='prefix'?<><b>{item.change}</b>{item.base}</>:<>{item.base}<b>{item.change}</b></>}</div>
    <div className="mc-family-meaning">{item.pos} {item.meaning}</div>
   </div>
  </div>;
 })}
 </div>
 </>;}
function Collocation({lesson,frame}:{lesson:Lesson;frame:number}){return <>
 <Word word={lesson.word} frame={frame}/>
 <div className="mc-blocks">{lesson.collocation.parts.map((text,index)=><div data-qa={`block-${index}`} key={text} className={`mc-block block-${index}`} style={{...appear(frame,index*16+15),fontSize:text.length>12?40:50}}>{text}</div>)}</div>
 <div data-qa="collocation-meaning" className="mc-collocation-meaning" style={appear(frame,60)}>{lesson.collocation.meaning}</div>
 <div data-qa="collocation-note" className="mc-small-note" style={appear(frame,72)}>{lesson.collocation.note}</div>
 <div className="mc-rule-line"/>
 <Illustration lesson={lesson} frame={frame} compact/>
 </>;}
function Example({lesson,scene,frame}:{lesson:Lesson;scene:Scene;frame:number}){
 const cue=scene.cues.find(c=>c.role==='example');const start=(cue?.startFrame??scene.startFrame)-scene.startFrame;
 const words=lesson.example.en.split(' ');const step=cue?Math.max(1,(cue.endFrame-cue.startFrame-12)/words.length):10;
 return <><Illustration lesson={lesson} frame={frame} compact/>
 <div data-qa="example-en" className="mc-example">{words.map((word,index)=><span key={index} style={{opacity:frame>=start+index*step?1:0}} className={lesson.example.highlight.includes(word)?'mc-highlight':''}>{word}{' '}</span>)}</div>
 <div data-qa="example-zh" className="mc-translation" style={appear(frame,(cue?.endFrame??scene.startFrame+90)-scene.startFrame)}>{lesson.example.zh}</div>
 </>;
}
function Quiz({lesson,scene,frame}:{lesson:Lesson;scene:Scene;frame:number}){
 const reveal=scene.answerFrame??scene.durationInFrames-50;const answered=frame>=reveal;
 const countdown=Math.ceil((reveal-frame)/30);
 return <><div data-qa="quiz-question" className="mc-question">{lesson.quiz.question}</div>
 <div className="mc-options">{lesson.quiz.options.map((text,index)=><div data-qa={`option-${index}`} key={text} style={appear(frame,index*8)} className={`mc-option ${answered&&index===lesson.quiz.answer?'correct':''}`}><span className="mc-letter">{'ABC'[index]}</span><span>{text}</span><span className="mc-check">{answered&&index===lesson.quiz.answer?'✓':''}</span></div>)}</div>
 <div data-qa="quiz-result" className="mc-quiz-result">{answered?<><b>{'ABC'[lesson.quiz.answer]} 答对了</b><div>{lesson.quiz.explanation}</div></>:countdown<=3?<span className="mc-countdown">{countdown}</span>:<span className="mc-think">想一想</span>}</div></>;
}
function SceneContent({lesson,scene}:{lesson:Lesson;scene:Scene}){
 const frame=useCurrentFrame();
 return <div className={`mc-stage scene-${scene.id}`}>
 <div data-qa="scene-label" className="mc-scene-label"><span>{String(lesson.scenes.indexOf(scene)+1).padStart(2,'0')}</span>{scene.label}</div>
 <div className="mc-content">
 {scene.id==='hook'&&<><Word word={lesson.word} frame={frame}/><div data-qa="hook" className="mc-hook">{lesson.hook[0]} <strong>{lesson.hook[1]}</strong></div><Illustration lesson={lesson} frame={frame}/></>}
 {scene.id==='word'&&<><Word word={lesson.word} frame={frame}/><div data-qa="ipa" className="mc-ipa">{lesson.ipa}</div><div className="mc-meanings">{lesson.meanings.map((item,index)=><div data-qa={`meaning-${index}`} className="mc-meaning" style={appear(frame,10+index*15)} key={item.pos}><b>{item.pos}</b>{item.text}</div>)}</div><Illustration lesson={lesson} frame={frame} compact/></>}
 {scene.id==='memory'&&<><div data-qa="memory-title" className="mc-memory-title">{lesson.memoryText[0]}</div><Illustration lesson={lesson} frame={frame}/><div data-qa="memory-note" className="mc-memory-note"><b>{lesson.word}</b><span>{lesson.memoryText[1]}</span></div></>}
 {scene.id==='family'&&<Family lesson={lesson} scene={scene} frame={frame}/>}
 {scene.id==='collocation'&&<Collocation lesson={lesson} frame={frame}/>}
 {scene.id==='example'&&<Example lesson={lesson} scene={scene} frame={frame}/>}
 {scene.id==='exam'&&<><div data-qa="exam-title" className="mc-exam-title">{lesson.exam.title}</div><div className="mc-exam-items">{lesson.exam.items.map((item,index)=><div data-qa={`exam-${index}`} key={item.word} className={`mc-paper exam-${index}`} style={appear(frame,index*35)}><b>{item.word}</b><span>{item.label}</span></div>)}</div><div data-qa="exam-note" className="mc-exam-note" style={appear(frame,70)}>{lesson.exam.note}</div></>}
 {scene.id==='quiz'&&<Quiz lesson={lesson} scene={scene} frame={frame}/>}
 {scene.id==='ending'&&<><Word word={lesson.word} frame={frame}/><div data-qa="ending-meaning" className="mc-ending-meaning">{lesson.meanings.map(item=>item.text).join(' / ')}</div><div className="mc-rule-line"/><div data-qa="next-label" className="mc-next-label">{lesson.nextLabel??'下一个词'}</div><div data-qa="next-word" className="mc-next-word">{lesson.next}</div></>}
 </div></div>;
}
function LayoutAudit({frame}:{frame:number}){
 useLayoutEffect(()=>{
  const handle=delayRender('Measure rendered typography');let cancelled=false;
  const audit=()=>{
  if(cancelled)return;
  const root=document.querySelector('.mc-video')!.getBoundingClientRect();const scale=root.width/1080;
  const boxes=Array.from(document.querySelectorAll<HTMLElement>('[data-qa]')).filter(el=>{
   let node:HTMLElement|null=el;while(node&&node!==document.body){if(Number(getComputedStyle(node).opacity)===0)return false;node=node.parentElement;}return true;
  }).map(el=>{const r=el.getBoundingClientRect();return {id:el.dataset.qa!,x:(r.left-root.left)/scale,y:(r.top-root.top)/scale,w:r.width/scale,h:r.height/scale,overflow:el.scrollWidth>el.clientWidth+2};});
  const errors:string[]=[];
  boxes.forEach(b=>{if(b.x<76||b.x+b.w>944||b.y<115||b.y+b.h>1620)errors.push(`unsafe:${b.id}`);if(b.overflow)errors.push(`overflow:${b.id}`);});
  for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){const a=boxes[i],b=boxes[j];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>3&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>3)errors.push(`overlap:${a.id}/${b.id}`);}
  const subtitle=document.querySelector<HTMLElement>('.mc-subtitle');if(subtitle){const css=getComputedStyle(subtitle);const lines=(subtitle.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom))/parseFloat(css.lineHeight);if(lines>2.1)errors.push('subtitle:more-than-two-lines');}
  console.log('MICROCOURSE_QA '+JSON.stringify({frame,boxes,errors}));
  continueRender(handle);
  };
  document.fonts.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(audit)));
  return ()=>{cancelled=true;continueRender(handle);};
 },[frame]);return null;
}
export const Microcourse:React.FC<{lesson:Lesson;qa?:boolean}>=({lesson,qa=false})=>{
 const frame=useCurrentFrame();if(lesson.needsReview)throw new Error('Unreviewed lesson cannot render');
 const cue=lesson.cues.find(c=>frame>=c.startFrame&&frame<c.endFrame);
 return <AbsoluteFill className={`mc-video ${lesson.silentInitial?'mc-silent-initial':''} ${lesson.flexContent?'mc-flex-content':''}`}>
 <div className="mc-paper-texture"/>
 <header className="mc-header"><div data-qa="unit">{lesson.unitLabel}</div><div className="mc-header-second"><span data-qa="series">{lesson.seriesLabel}</span><span data-qa="episode">{lesson.id}</span></div></header>
 {lesson.scenes.map(scene=><Sequence key={scene.id} from={scene.startFrame} durationInFrames={scene.durationInFrames}><SceneContent lesson={lesson} scene={scene}/></Sequence>)}
 <div className="mc-subtitle-zone">{cue&&<div data-qa="subtitle" className={`mc-subtitle ${cue.lang==='en'?'english':''}`}>{cue.text}</div>}</div>
 <div className="mc-progress"><div style={{width:`${100*(frame+1)/lesson.durationInFrames}%`}}/></div>
 <Audio src={staticFile(lesson.audio)}/>{qa&&<LayoutAudit frame={frame}/>}
 </AbsoluteFill>;
};
