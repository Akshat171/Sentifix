import { useVideoConfig } from 'remotion';

export type Cut = 'landscape' | 'vertical';

export interface TypeScale {
  h1: number; h2: number; body: number; mono: number; small: number;
  pad: number; gap: number;
}

/**
 * Explicit per-cut sizes rather than one scale factor. A 9:16 frame is narrower
 * but watched closer, so headlines shrink while body copy grows — a single
 * multiplier cannot do both.
 */
const SCALES: Record<Cut, TypeScale> = {
  landscape: { h1: 84, h2: 50, body: 32, mono: 25, small: 19, pad: 120, gap: 22 },
  vertical: { h1: 66, h2: 42, body: 33, mono: 24, small: 18, pad: 72, gap: 20 },
};

/** Which cut are we rendering? Derived from the frame, never passed down. */
export const useCut = (): { cut: Cut; t: TypeScale; width: number; height: number } => {
  const { width, height } = useVideoConfig();
  const cut: Cut = height > width ? 'vertical' : 'landscape';
  return { cut, t: SCALES[cut], width, height };
};
