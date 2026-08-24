import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { Stage } from '../components/Stage';
import { THEME, ENTER_SPRING } from '../theme';
import { MONO } from '../fonts';
import { useCut } from '../type';

const STACK = [
  'NestJS 10', 'Fastify', 'TypeScript 5', 'LangGraph.js',
  'PostgreSQL 16', 'pgvector', 'tsvector BM25', 'Redis 7',
  'RabbitMQ 3', 'TypeORM 0.3', 'Octokit', 'OpenTelemetry',
];

const CLAIMS = [
  'MIT licensed.',
  'Self-hosted, or one click to deploy.',
  'Your code never leaves your infrastructure.',
];

/** Scene 6. What it is made of, and the three things that matter about it. */
export const Build: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, cut } = useCut();

  return (
    <Stage center>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cut === 'vertical' ? 2 : 4}, minmax(0, 1fr))`,
          gap: 12,
          width: '100%',
        }}
      >
        {STACK.map((name, i) => {
          const s = spring({ fps, frame: frame - 4 - i * 3, config: ENTER_SPRING });
          return (
            <div
              key={name}
              style={{
                fontFamily: MONO,
                fontSize: t.mono,
                color: THEME.ink,
                background: THEME.surface,
                border: `1px solid ${THEME.line}`,
                borderRadius: 10,
                padding: '13px 10px',
                opacity: s,
                transform: `translateY(${(1 - s) * 18}px)`,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: t.gap * 2.4, display: 'flex', flexDirection: 'column', gap: t.gap }}>
        {CLAIMS.map((claim, i) => {
          const s = spring({ fps, frame: frame - 88 - i * 42, config: ENTER_SPRING });
          return (
            <div
              key={claim}
              style={{
                fontSize: t.h2,
                fontWeight: 600,
                letterSpacing: -0.8,
                opacity: s,
                transform: `translateY(${(1 - s) * 14}px)`,
              }}
            >
              {claim}
            </div>
          );
        })}
      </div>
    </Stage>
  );
};
