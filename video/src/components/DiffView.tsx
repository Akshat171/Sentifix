import React from 'react';
import { interpolate } from 'remotion';
import { THEME } from '../theme';
import { MONO } from '../fonts';
import { DIFF_LINES, type DiffKind } from '../generated/run-data';

const TONE: Record<DiffKind, { fg: string; bg: string }> = {
  file: { fg: THEME.muted, bg: 'transparent' },
  hunk: { fg: THEME.hunk, bg: THEME.hunkWash },
  add: { fg: THEME.add, bg: THEME.addWash },
  del: { fg: THEME.del, bg: THEME.delWash },
  ctx: { fg: THEME.ink, bg: 'transparent' },
};

/**
 * The real proposed diff, revealed a line at a time. `revealed` is a float so
 * the line currently arriving can fade rather than pop, which reads as drawing
 * rather than flickering.
 */
export const DiffView: React.FC<{
  revealed: number;
  fontSize: number;
  scrollLines?: number;
}> = ({ revealed, fontSize, scrollLines = 0 }) => {
  const lineHeight = fontSize * 1.5;

  return (
    <div
      style={{
        fontFamily: MONO,
        fontSize,
        lineHeight: `${lineHeight}px`,
        transform: `translateY(${-scrollLines * lineHeight}px)`,
      }}
    >
      {DIFF_LINES.map((line, i) => {
        const tone = TONE[line.kind];
        const opacity = interpolate(revealed - i, [0, 1], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={i}
            style={{
              opacity,
              background: tone.bg,
              color: tone.fg,
              whiteSpace: 'pre',
              paddingLeft: 10,
              paddingRight: 10,
              fontWeight: line.kind === 'hunk' ? 600 : 400,
            }}
          >
            {line.text || ' '}
          </div>
        );
      })}
    </div>
  );
};
