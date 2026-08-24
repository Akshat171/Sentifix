import { loadFont as loadInter } from '@remotion/google-fonts/Inter';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';

/**
 * Weights and subsets are pinned deliberately. Calling loadFont() bare fetches
 * every weight in every subset — 126 requests for Inter alone — which slows
 * every render and makes it depend on more of Google's CDN than it needs to.
 * Add a weight here if a scene genuinely needs one.
 */
const { fontFamily: sans } = loadInter('normal', {
  weights: ['400', '600'],
  subsets: ['latin'],
});

const { fontFamily: mono } = loadMono('normal', {
  weights: ['400', '500'],
  subsets: ['latin'],
});

export const SANS = sans;
export const MONO = mono;
