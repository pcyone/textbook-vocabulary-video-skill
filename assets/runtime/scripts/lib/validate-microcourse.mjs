export function assertReviewed(value) {
 if(!value||value.needsReview!==false||value.review?.status!=='reviewed')throw new Error('Content review required');
 const walk=node=>{if(!node||typeof node!=='object')return;if(node.needsReview===true||node.needs_review===true)throw new Error('Unresolved review flag');Object.values(node).forEach(walk);};walk(value);
}
export function validateTimeline(lesson) {
 assertReviewed(lesson);
 for(const key of ['id','word','ipa','unitLabel','seriesLabel','image','audio'])if(typeof lesson[key]!=='string'||!lesson[key].trim())throw new Error(`Missing ${key}`);
 // Monosyllables do not need a stress mark; delimiters and phonetic content do.
 if(!/^\/[^/\n]+\/$/.test(lesson.ipa)||!/[a-zɑæɐɒɔəɚɛɜɝɪʊʌθðŋʃʒ]/i.test(lesson.ipa))throw new Error('Incomplete IPA');
 if(!Number.isInteger(lesson.durationInFrames)||lesson.durationInFrames<1050||lesson.durationInFrames>2100)throw new Error('Invalid duration');
 if(!Array.isArray(lesson.quiz?.options)||lesson.quiz.options.length!==3||!Number.isInteger(lesson.quiz.answer)||!lesson.quiz.options[lesson.quiz.answer])throw new Error('Invalid quiz');
 let end=0;const ids=new Set();
 for(const scene of lesson.scenes){if(ids.has(scene.id)||scene.startFrame!==end||!Number.isInteger(scene.durationInFrames)||scene.durationInFrames<=0)throw new Error('Invalid scene timeline');ids.add(scene.id);end+=scene.durationInFrames;}
 if(end!==lesson.durationInFrames||!ids.has('quiz'))throw new Error('Incomplete scene timeline');
 end=0;if(!lesson.cues.length)throw new Error('No narration');
 for(const cue of lesson.cues){const scene=lesson.scenes.find(s=>s.id===cue.scene);
  if(!scene||!cue.text?.trim()||!['en','zh'].includes(cue.lang)||!Number.isInteger(cue.startFrame)||!Number.isInteger(cue.endFrame)||cue.startFrame<end||cue.endFrame<=cue.startFrame||cue.startFrame<scene.startFrame||cue.endFrame>scene.startFrame+scene.durationInFrames)throw new Error('Invalid cue timeline');
  if(!Number.isFinite(cue.audioDuration)||Math.abs((cue.endFrame-cue.startFrame)/30-cue.audioDuration)>1/30+1e-6)throw new Error('Audio and subtitle mismatch');
  if(cue.lang==='zh'&&/[a-zA-Z]/.test(cue.text))throw new Error('English routed to Chinese TTS');
  end=cue.endFrame;
 }
 const quiz=lesson.scenes.find(s=>s.id==='quiz');const question=quiz.cues[0];
 if(!Number.isInteger(quiz.answerFrame)||quiz.startFrame+quiz.answerFrame-question.endFrame<90)throw new Error('Quiz needs three seconds to think');
 return true;
}
