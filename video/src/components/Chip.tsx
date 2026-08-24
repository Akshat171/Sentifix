import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { THEME, ENTER_SPRING } from '../theme';
import { MONO } from '../fonts';

const SEVERITY: Record<string, string> = {
  critical: THEME.sevCritical,
  high: THEME.sevHigh,
  medium: THEME.sevMedium,
  low: THEME.sevLow,
};

/** A classification chip that springs in at `delay` and holds. */
export const Chip: React.FC<{
  text: string;
  delay: number;
  size: number;
  tone?: string;
}> = ({ text, delay, size, tone }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ fps, frame: frame - delay, config: ENTER_SPRING });
  const color = tone ? (SEVERITY[tone] ?? THEME.accentText) : THEME.ink;

  return (
    <span
      style={{
        fontFamily: MONO,
        fontSize: size,
        fontWeight: 600,
        color,
        background: THEME.sunk,
        border: `1px solid ${color}44`,
        borderRadius: 9,
        padding: `${size * 0.34}px ${size * 0.7}px`,
        whiteSpace: 'nowrap',
        opacity: s,
        transform: `translateY(${(1 - s) * 18}px) scale(${0.94 + s * 0.06})`,
      }}
    >
      {text}
    </span>
  );
};
