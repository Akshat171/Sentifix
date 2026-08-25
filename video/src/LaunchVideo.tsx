import React from 'react';
import { AbsoluteFill, Sequence } from 'remotion';
import { Watermark } from './components/Watermark';
import { SCENES, sceneOffsets } from './timeline';
import { THEME } from './theme';
import { ThePile } from './scenes/ThePile';
import { Mark } from './scenes/Mark';
import { Pipeline } from './scenes/Pipeline';
import { Judge } from './scenes/Judge';
import { Delivery } from './scenes/Delivery';
import { Build } from './scenes/Build';
import { CTA } from './scenes/CTA';

const SCENE_COMPONENTS: Record<string, React.FC> = {
  pile: ThePile,
  mark: Mark,
  pipeline: Pipeline,
  judge: Judge,
  delivery: Delivery,
  build: Build,
  cta: CTA,
};

/**
 * Both cuts are the same scenes at different durations, so the assembly is
 * shared and only the `cut` differs. A scene with 0 frames in a cut is dropped
 * from it entirely.
 */
export const LaunchVideo: React.FC<{ cut: 'landscape' | 'vertical' }> = ({ cut }) => {
  const offsets = sceneOffsets(cut);

  return (
    <AbsoluteFill style={{ backgroundColor: THEME.ground }}>
      {SCENES.map((scene, i) => {
        const duration = scene[cut];
        if (duration === 0) {
          return null;
        }
        const Scene = SCENE_COMPONENTS[scene.id];
        return (
          <Sequence
            key={scene.id}
            name={scene.title}
            from={offsets[i]}
            durationInFrames={duration}
          >
            <Scene />
          </Sequence>
        );
      })}

      {/* The mark parks in the corner once scene 2 has introduced it. */}
      <Sequence
        from={offsets[2]}
        durationInFrames={offsets[6] - offsets[2]}
        name="watermark"
        layout="none"
      >
        <Watermark />
      </Sequence>
    </AbsoluteFill>
  );
};
