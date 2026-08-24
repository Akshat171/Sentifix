import React from 'react';
import { interpolate, Easing } from 'remotion';
import { THEME } from '../theme';
import { MONO } from '../fonts';
import { useCut } from '../type';

export const NODES = ['classify', 'retrieve', 'diagnose', 'retrieveTargeted', 'proposeFix'];

/**
 * The LangGraph rail. It stays on screen for the whole pipeline scene and is the
 * viewer's only orientation cue.
 *
 * `pos` is a float, not an index: the caller eases it across beat boundaries so
 * the rail glides as one unit. Rounding it here would make the highlight jump
 * while the shift slid, which reads as two separate animations.
 */
export const Rail: React.FC<{ pos: number; progress: number }> = ({ pos, progress }) => {
  const { t, cut, width } = useCut();
  const size = cut === 'vertical' ? t.small : t.mono;
  const active = Math.round(pos);
  const shift = interpolate(pos, [0, NODES.length - 1], [width * 0.05, -width * 0.05]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: cut === 'vertical' ? 5 : 11,
        transform: `translateX(${shift}px)`,
        flexWrap: 'nowrap',
      }}
    >
      {NODES.map((name, i) => {
        const done = i < active;
        const isActive = i === active;
        // Distance from the eased position, so the glow crossfades between pills.
        const heat = Math.max(0, 1 - Math.abs(pos - i));
        const color = isActive ? THEME.accent : done ? THEME.add : THEME.muted;
        const glow = heat * interpolate(progress, [0, 1], [0.4, 1], {
          easing: Easing.out(Easing.cubic),
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });

        return (
          <React.Fragment key={name}>
            {i > 0 ? (
              <div
                style={{
                  width: cut === 'vertical' ? 10 : 30,
                  height: 2,
                  background: done || isActive ? THEME.add : THEME.line,
                  flex: 'none',
                }}
              />
            ) : null}
            <div
              style={{
                fontFamily: MONO,
                fontSize: size,
                fontWeight: 600,
                color,
                border: `1px solid ${isActive ? THEME.accent : done ? THEME.add + '66' : THEME.line}`,
                background: isActive ? THEME.accentWash : THEME.surface,
                borderRadius: 999,
                padding: `${size * 0.4}px ${size * 0.8}px`,
                whiteSpace: 'nowrap',
                boxShadow: glow > 0.02 ? `0 0 ${30 * glow}px ${THEME.accent}55` : 'none',
                flex: 'none',
              }}
            >
              {name}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
};
