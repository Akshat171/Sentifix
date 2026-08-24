import React from 'react';
import { Composition } from 'remotion';
import { LaunchVideo } from './LaunchVideo';
import { FPS, totalFrames } from './timeline';

export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="LaunchVideo"
      component={LaunchVideo}
      durationInFrames={totalFrames('landscape')}
      fps={FPS}
      width={1920}
      height={1080}
      defaultProps={{ cut: 'landscape' as const }}
    />
    <Composition
      id="LaunchVideoVertical"
      component={LaunchVideo}
      durationInFrames={totalFrames('vertical')}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ cut: 'vertical' as const }}
    />
  </>
);
