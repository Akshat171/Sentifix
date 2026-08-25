import React from 'react';
import { Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Stage } from '../components/Stage';
import { THEME, ENTER_SPRING } from '../theme';
import { MONO } from '../fonts';
import { useCut, type TypeScale } from '../type';
import { RUN, EVAL, DIFF_STATS } from '../generated/run-data';

const Card: React.FC<{
  title: string;
  lines: string[];
  delay: number;
  t: TypeScale;
  drift: number;
}> = ({ title, lines, delay, t, drift }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ fps, frame: frame - delay, config: ENTER_SPRING });

  return (
    <div
      style={{
        flex: 1,
        background: THEME.surface,
        border: `1px solid ${THEME.line}`,
        borderRadius: 14,
        padding: t.gap,
        opacity: s,
        transform: `translate(${(1 - s) * drift}px, ${(1 - s) * 40}px)`,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: MONO,
          fontSize: t.small,
          letterSpacing: '.12em',
          textTransform: 'uppercase',
          color: THEME.accentText,
        }}
      >
        {title}
      </div>
      {lines.map((l, i) => (
        <div
          key={i}
          style={{
            fontFamily: MONO,
            fontSize: t.mono * 0.92,
            color: i === 0 ? THEME.ink : THEME.muted,
            lineHeight: 1.45,
          }}
        >
          {l}
        </div>
      ))}
    </div>
  );
};

/**
 * Scene 5. One scored patch, three destinations. The dashboard frame is cropped
 * to its real rows — the local database also holds a synthetic demo repo, and
 * that row is deliberately out of shot.
 */
export const Delivery: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, cut } = useCut();

  const head = spring({ fps, frame: frame - 2, config: ENTER_SPRING });
  const settle = interpolate(frame, [170, 220], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });

  return (
    <Stage>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: t.gap * 1.2,
          height: '100%',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            fontSize: t.h2,
            fontWeight: 600,
            letterSpacing: -1,
            opacity: head,
            transform: `translateY(${(1 - head) * 16}px)`,
          }}
        >
          Posted back where your team already works.
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: cut === 'vertical' ? 'column' : 'row',
            gap: t.gap,
            opacity: 1 - settle,
            transform: `scale(${1 - settle * 0.06})`,
            flex: 'none',
            // Collapse the row as it fades; otherwise the invisible cards keep
            // their space and the dashboard sits under a gap.
            height: (1 - settle) * (cut === 'vertical' ? 620 : 200),
            overflow: 'hidden',
          }}
        >
          <Card
            title="github comment"
            delay={18}
            drift={-60}
            t={t}
            lines={[
              `${RUN.classification.severity} · ${RUN.classification.category}`,
              RUN.classification.components.join(', '),
              `score ${EVAL.score}`,
            ]}
          />
          <Card
            title="pull request"
            delay={34}
            drift={0}
            t={t}
            lines={[
              'branch created, diff applied',
              `${DIFF_STATS.files} files changed`,
              `+${DIFF_STATS.additions} −${DIFF_STATS.deletions}`,
            ]}
          />
          <Card
            title="slack thread"
            delay={50}
            drift={60}
            t={t}
            lines={['replied in thread', RUN.issue.title, RUN.issue.repoFullName]}
          />
        </div>

        <div
          style={{
            borderRadius: 14,
            overflow: 'hidden',
            border: `1px solid ${THEME.line}`,
            opacity: settle,
          }}
        >
          <Img
            src={staticFile('dashboard-real.jpg')}
            style={{
              width: '100%',
              display: 'block',
              transform: `scale(${1 + (1 - settle) * 0.03})`,
              transformOrigin: 'top center',
            }}
          />
        </div>
      </div>
    </Stage>
  );
};
