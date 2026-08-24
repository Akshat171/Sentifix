import React from 'react';
import { AbsoluteFill } from 'remotion';
import { THEME } from '../theme';
import { SANS } from '../fonts';
import { useCut } from '../type';

/** Every scene's ground: brand background, safe margins, sans by default. */
export const Stage: React.FC<{
  children: React.ReactNode;
  center?: boolean;
  pad?: number;
  background?: string;
}> = ({ children, center = false, pad, background }) => {
  const { t } = useCut();
  return (
    <AbsoluteFill
      style={{
        backgroundColor: background ?? THEME.ground,
        color: THEME.ink,
        fontFamily: SANS,
        padding: pad ?? t.pad,
        ...(center
          ? { alignItems: 'center', justifyContent: 'center', textAlign: 'center' as const }
          : {}),
      }}
    >
      {children}
    </AbsoluteFill>
  );
};
