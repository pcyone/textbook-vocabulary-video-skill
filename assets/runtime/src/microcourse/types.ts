export type Cue = {lang:'zh'|'en';text:string;startFrame:number;endFrame:number;audio:string;audioDuration:number;scene:string;reveal?:number;role?:string};
export type Scene = {id:string;label:string;startFrame:number;durationInFrames:number;cues:Cue[];answerFrame?:number;exampleFrame?:number};
export type Lesson = {
 id:string;slug:string;unitLabel:string;seriesLabel:string;title:string;word:string;ipa:string;
 meanings:{pos:string;text:string}[];
 family:{word:string;pos:string;meaning:string;base:string;change:string;placement:string}[];
 collocation:{parts:string[];meaning:string;note:string};
 example:{en:string;zh:string;highlight:string[]};hook:string[];memoryText:string[];
 exam:{title:string;items:{word:string;label:string}[];note:string};
 quiz:{question:string;options:string[];answer:number;explanation:string};
 next:string;nextLabel?:string;image:string;imageFit?:'contain'|'cover';familyRoot?:string;familyMode?:'categories'|'tree';flexContent?:boolean;silentInitial?:boolean;audio:string;scenes:Scene[];cues:Cue[];durationInFrames:number;
 needsReview:boolean;
};
