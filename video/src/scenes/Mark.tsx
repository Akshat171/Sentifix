import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Stage } from '../components/Stage';
import { BrandMark } from '../components/BrandMark';
import { THEME } from '../theme';
import { useCut } from '../type';

/**
 * Scene 2. The dot becomes a check: the whole product in one gesture. Nothing
 * else moves while it draws.
 */
export const Mark: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, cut } = useCut();

  const markIn = spring({ fps, frame: frame - 6, config: { damping: 200 } });
  const draw = interpolate(frame, [26, 62], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  // The wordmark wipes out of the mark rather than fading in beside it.
  const wipe = interpolate(frame, [58, 86], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const sub = spring({ fps, frame: frame - 92, config: { damping: 200 } });
  const size = cut === 'vertical' ? 150 : 168;

  return (
    <Stage center background="#000">
      <div style={{ display: 'flex', alignItems: 'center', gap: t.gap * 1.6 }}>
        <div style={{ opacity: markIn, transform: `scale(${0.86 + markIn * 0.14})`, flex: 'none' }}>
          <BrandMark size={size} progress={draw} />
        </div>
        <div
          style={{
            fontSize: cut === 'vertical' ? t.h1 : 118,
            fontWeight: 600,
            letterSpacing: -3,
            clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
          }}
        >
          Sentifix
        </div>
      </div>
      <div
        style={{
          fontSize: t.h2,
          color: THEME.muted,
          marginTop: t.gap * 1.6,
          opacity: sub,
          transform: `translateY(${(1 - sub) * 14}px)`,
        }}
      >
        AI triage for your GitHub issues.
      </div>
    </Stage>
  );
};
