import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage } from '../components/Stage';
import { BrandMark } from '../components/BrandMark';
import { THEME, ENTER_SPRING } from '../theme';
import { MONO } from '../fonts';
import { useCut } from '../type';

const LINES = ['git clone https://github.com/Akshat171/sentifix', 'docker compose up -d'];
const CPF = 1.6; // characters per frame — same cadence as the diagnose beat

/**
 * Scene 7. Two commands and where to find it. The last 30 frames are completely
 * static so the closing frame works as a thumbnail.
 */
export const CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, cut } = useCut();

  const markIn = spring({ fps, frame: frame - 2, config: ENTER_SPRING });

  // Type line 1, then line 2, each from its own start.
  const starts = [20, 20 + Math.ceil(LINES[0].length / CPF) + 14];
  const typed = LINES.map((line, i) =>
    Math.max(0, Math.min(line.length, Math.floor((frame - starts[i]) * CPF))),
  );
  const done = typed[1] === LINES[1].length;
  const links = spring({ fps, frame: frame - (starts[1] + 40), config: ENTER_SPRING });
  // The terminal fades in with the mark; an empty box on frame 0 looks unfinished.
  const boxIn = spring({ fps, frame: frame - 10, config: ENTER_SPRING });

  return (
    <Stage center>
      <div style={{ opacity: markIn, transform: `scale(${0.9 + markIn * 0.1})` }}>
        <BrandMark size={cut === 'vertical' ? 104 : 116} progress={1} />
      </div>

      <div
        style={{
          marginTop: t.gap * 2,
          background: THEME.surface,
          border: `1px solid ${THEME.line}`,
          borderRadius: 14,
          padding: `${t.gap * 1.1}px ${t.gap * 1.3}px`,
          textAlign: 'left',
          minWidth: cut === 'vertical' ? '100%' : 820,
          opacity: boxIn,
          transform: `translateY(${(1 - boxIn) * 16}px)`,
        }}
      >
        {LINES.map((line, i) => (
          <div
            key={line}
            style={{
              fontFamily: MONO,
              fontSize: cut === 'vertical' ? t.mono * 0.86 : t.mono,
              lineHeight: 1.85,
              color: THEME.ink,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ color: THEME.accentText }}>$ </span>
            {line.slice(0, typed[i])}
            {typed[i] > 0 && typed[i] < line.length ? (
              <span style={{ color: THEME.accent }}>▋</span>
            ) : null}
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: t.gap * 2,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          opacity: done ? links : 0,
        }}
      >
        <div style={{ fontSize: t.h2, fontWeight: 600, letterSpacing: -1 }}>sentifix.dev</div>
        <div style={{ fontFamily: MONO, fontSize: t.mono, color: THEME.muted }}>
          github.com/Akshat171/sentifix
        </div>
      </div>
    </Stage>
  );
};
