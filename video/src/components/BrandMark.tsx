import React from 'react';
import { MARK_GRADIENT } from '../theme';

/**
 * The Sentifix mark: an unresolved report (the dot) becoming a resolved one
 * (the check). Ported from BRAND_MARK in the app's src/ui/theme.ts.
 *
 * `progress` (0-1) draws the check stroke, so the same component serves both
 * the animated reveal in scene 2 and the static corner watermark after it.
 */
export const BrandMark: React.FC<{ size?: number; progress?: number }> = ({
  size = 64,
  progress = 1,
}) => {
  const CHECK_LENGTH = 52;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="sfx-mark" x1="0" y1="0" x2=".3" y2="1">
          <stop offset="0" stopColor={MARK_GRADIENT.from} />
          <stop offset="1" stopColor={MARK_GRADIENT.to} />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#sfx-mark)" />
      <circle cx="15" cy="35" r="5.5" fill="#F7F1E8" opacity=".6" />
      <path
        d="M15 35l13 10 21-25"
        fill="none"
        stroke="#F9F4EC"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={CHECK_LENGTH}
        strokeDashoffset={CHECK_LENGTH * (1 - progress)}
      />
    </svg>
  );
};
