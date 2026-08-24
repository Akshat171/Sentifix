import React from 'react';
import { interpolate, Easing } from 'remotion';
import { THEME } from '../theme';
import { MONO } from '../fonts';

/** A radial dial for one eval dimension. Sweeps once, then holds. */
export const Meter: React.FC<{
  label: string;
  value: number;
  delay: number;
  frame: number;
  size: number;
  labelSize: number;
}> = ({ label, value, delay, frame, size, labelSize }) => {
  const swept = interpolate(frame - delay, [0, 34], [0, value], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const r = size / 2 - 8;
  const circumference = 2 * Math.PI * r;
  const tone = value >= 1 ? THEME.add : THEME.accent;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={THEME.line} strokeWidth="7" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={tone}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - swept)}
          />
        </svg>
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: MONO,
            fontSize: size * 0.26,
            fontWeight: 600,
            color: tone,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {swept.toFixed(2)}
        </div>
      </div>
      <div style={{ fontFamily: MONO, fontSize: labelSize, color: THEME.muted }}>{label}</div>
    </div>
  );
};
