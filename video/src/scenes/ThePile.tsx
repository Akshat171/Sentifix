import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage } from '../components/Stage';
import { THEME, ENTER_SPRING } from '../theme';
import { MONO } from '../fonts';
import { useCut } from '../type';
import { RUN } from '../generated/run-data';

const SEV: Record<string, string> = {
  critical: THEME.sevCritical,
  high: THEME.sevHigh,
  medium: THEME.sevMedium,
  low: THEME.sevLow,
};

/**
 * Scene 1. Real issues from the local index stack up faster than they can be
 * read. The gap between arrivals shrinks each time — the pile is meant to feel
 * like it is getting ahead of you, which a constant stagger never does.
 */
export const ThePile: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const { t, cut } = useCut();

  const rows = RUN.inbox;
  let at = 26;
  let gap = 15;
  const delays = rows.map(() => {
    const d = at;
    at += gap;
    gap *= 0.82;
    return d;
  });

  const headline = spring({ fps, frame: frame - 4, config: ENTER_SPRING });
  // Hard cut to black on the tail so the mark lands on an empty frame.
  const blackout = interpolate(frame, [durationInFrames - 9, durationInFrames - 2], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <Stage>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: t.gap * 1.4 }}>
        <div
          style={{
            fontSize: t.h1,
            fontWeight: 600,
            letterSpacing: -1.5,
            lineHeight: 1.1,
            maxWidth: cut === 'vertical' ? '100%' : '72%',
            opacity: headline,
            transform: `translateY(${(1 - headline) * 22}px)`,
          }}
        >
          Bug reports arrive faster than anyone can read them.
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            justifyContent: 'flex-end',
            flex: 1,
            minHeight: 0,
            // The pile is meant to outgrow its box; clipping at the top edge
            // reads as overflow, whereas overlapping the headline reads as a bug.
            overflow: 'hidden',
            maskImage: 'linear-gradient(to bottom, transparent 0, #000 92px)',
            WebkitMaskImage: 'linear-gradient(to bottom, transparent 0, #000 92px)',
          }}
        >
          {rows.map((row, i) => {
            const s = spring({ fps, frame: frame - delays[i], config: ENTER_SPRING });
            return (
              <div
                key={`${row.repo}#${row.number}`}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  background: THEME.surface,
                  border: `1px solid ${THEME.line}`,
                  borderRadius: 12,
                  padding: `${t.gap * 0.7}px ${t.gap}px`,
                  opacity: s,
                  transform: `translateY(${(1 - s) * 90}px)`,
                  flex: 'none',
                }}
              >
                <div
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 3,
                    background: SEV[row.severity] ?? THEME.muted,
                    flex: 'none',
                  }}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: t.body,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {row.title}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: t.small, color: THEME.muted, marginTop: 4 }}>
                    {row.repo} · #{row.number}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AbsoluteFill style={{ background: '#000', opacity: blackout }} />
    </Stage>
  );
};
