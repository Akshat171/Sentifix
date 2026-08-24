import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { Stage } from '../components/Stage';
import { Meter } from '../components/Meter';
import { THEME, ENTER_SPRING } from '../theme';
import { MONO } from '../fonts';
import { useCut } from '../type';
import { EVAL } from '../generated/run-data';

/**
 * Scene 4. The judge. Every number here is the stored eval for the run shown in
 * scene 3 — nothing is styled up or rounded in our favour.
 */
export const Judge: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { t, cut } = useCut();

  const head = spring({ fps, frame: frame - 2, config: ENTER_SPRING });
  const score = interpolate(frame, [26, 74], [0, EVAL.score], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  const caption = spring({ fps, frame: frame - 108, config: ENTER_SPRING });

  const dims = Object.entries(EVAL.breakdown);
  const meterSize = cut === 'vertical' ? 168 : 158;

  return (
    <Stage center>
      <div
        style={{
          fontFamily: MONO,
          fontSize: t.small,
          letterSpacing: '.14em',
          textTransform: 'uppercase',
          color: THEME.accentText,
          opacity: head,
        }}
      >
        LLM-as-judge
      </div>

      <div
        style={{
          fontFamily: MONO,
          fontSize: cut === 'vertical' ? 140 : 176,
          fontWeight: 600,
          letterSpacing: -6,
          lineHeight: 1,
          marginTop: t.gap,
          fontVariantNumeric: 'tabular-nums',
          color: THEME.add,
        }}
      >
        {score.toFixed(3)}
      </div>

      <div
        style={{
          display: 'flex',
          gap: cut === 'vertical' ? 18 : 46,
          marginTop: t.gap * 2,
          flexWrap: 'wrap',
          justifyContent: 'center',
        }}
      >
        {dims.map(([name, value], i) => (
          <Meter
            key={name}
            label={name}
            value={value as number}
            delay={40 + i * 13}
            frame={frame}
            size={meterSize}
            labelSize={t.small}
          />
        ))}
      </div>

      <div
        style={{
          fontSize: t.body,
          color: THEME.muted,
          marginTop: t.gap * 2,
          maxWidth: cut === 'vertical' ? '100%' : '76%',
          lineHeight: 1.45,
          opacity: caption,
        }}
      >
        Every patch is scored before a human sees it. Judge: {EVAL.judgeModel}.
      </div>
    </Stage>
  );
};
