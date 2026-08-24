import React from 'react';
import { THEME } from '../theme';
import { MONO } from '../fonts';
import { useCut } from '../type';

/** A surface card, matching the product's own panels. */
export const Panel: React.FC<{
  children: React.ReactNode;
  label?: string;
  style?: React.CSSProperties;
  accent?: boolean;
}> = ({ children, label, style, accent = false }) => {
  const { t } = useCut();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, ...style }}>
      {label ? (
        <div
          style={{
            fontFamily: MONO,
            fontSize: t.small,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: THEME.accentText,
          }}
        >
          {label}
        </div>
      ) : null}
      <div
        style={{
          background: THEME.surface,
          border: `1px solid ${accent ? THEME.accent : THEME.line}`,
          borderRadius: 14,
          padding: t.gap,
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
};
