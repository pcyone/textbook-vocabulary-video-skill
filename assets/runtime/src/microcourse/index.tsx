import React from 'react';
import {AbsoluteFill, Composition, registerRoot} from 'remotion';
import {Microcourse} from './Microcourse';
import type {Lesson} from './types';

type Props = {lesson?: Lesson; qa?: boolean};
const Video: React.FC<Props> = ({lesson, qa}) => lesson
  ? <Microcourse lesson={lesson} qa={qa}/>
  : <AbsoluteFill style={{background: 'white', color: 'black', padding: 80}}>Provide a reviewed lesson through inputProps.</AbsoluteFill>;
const Root = () => <Composition id="VocabularyMicrocourse" component={Video}
  width={1080} height={1920} fps={30} durationInFrames={1800}
  defaultProps={{lesson: undefined, qa: false} as Props}
  calculateMetadata={({props}) => {
    const lesson = props.lesson as Lesson | undefined;
    if (!lesson) throw new Error('Missing lesson inputProps; run scripts/render-microcourse.mjs --lesson=SLUG');
    return {durationInFrames: lesson.durationInFrames};
  }}/>;
registerRoot(Root);
