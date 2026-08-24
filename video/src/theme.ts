/**
 * Ported from the app's src/ui/theme.ts (dark token set only — the video is
 * always dark). Keep these in sync by hand: if the product palette moves, the
 * video should move with it.
 */
export const THEME = {
  ground: '#121316',
  surface: '#191B1F',
  sunk: '#1F2126',
  ink: '#EDEAE6',
  muted: '#9A948C',
  line: '#2B2E33',
  accent: '#E08050',
  accentText: '#EC9269',
  accentWash: '#2A1D17',
  add: '#55C48A',
  addWash: '#152A20',
  del: '#E0796C',
  delWash: '#2C1A18',
  hunk: '#7FA8DC',
  hunkWash: '#182230',
  sevCritical: '#F0776B',
  sevHigh: '#E8994E',
  sevMedium: '#D8BC55',
  sevLow: '#55C48A',
} as const;

/** The brand mark's gradient stops, from BRAND_MARK in the app theme. */
export const MARK_GRADIENT = { from: '#C2643F', to: '#9E3A22' } as const;

/** Copy stays inside this margin on every frame. */
export const SAFE_MARGIN = 120;

/** Spring config used for every position/scale/opacity entrance. */
export const ENTER_SPRING = { damping: 200 } as const;
