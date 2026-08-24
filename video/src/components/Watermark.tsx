import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BrandMark } from './BrandMark';
import { useCut } from '../type';

/** The mark, parked in a corner for every scene after its reveal. */
export const Watermark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t } = useCut();
  const s = spring({ fps, frame, config: { damping: 200 } });

  return (
    <div
      style={{
        position: 'absolute',
        left: t.pad * 0.42,
        top: t.pad * 0.42,
        opacity: s * 0.62,
        transform: `scale(${0.8 + s * 0.2})`,
      }}
    >
      <BrandMark size={40} progress={1} />
    </div>
  );
};
