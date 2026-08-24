/**
 * The cut. Both compositions are assembled from this, so retiming the video is
 * a single edit here rather than seven edits across the scene files.
 */
export interface SceneCue {
  id: string;
  title: string;
  /** Frames in the 1920x1080 hero cut. */
  landscape: number;
  /** Frames in the 9:16 social cut. 0 = dropped from that cut. */
  vertical: number;
}

export const SCENES: SceneCue[] = [
  { id: 'pile', title: 'The pile', landscape: 150, vertical: 120 },
  { id: 'mark', title: 'Mark', landscape: 150, vertical: 120 },
  { id: 'pipeline', title: 'The pipeline', landscape: 780, vertical: 540 },
  { id: 'judge', title: 'The judge', landscape: 240, vertical: 180 },
  { id: 'delivery', title: 'Delivery', landscape: 330, vertical: 240 },
  { id: 'build', title: 'The build', landscape: 270, vertical: 0 },
  { id: 'cta', title: 'CTA', landscape: 240, vertical: 150 },
];

export const FPS = 30;

export const totalFrames = (cut: 'landscape' | 'vertical'): number =>
  SCENES.reduce((sum, s) => sum + s[cut], 0);

/** Absolute start frame of each scene, in order, for the given cut. */
export const sceneOffsets = (cut: 'landscape' | 'vertical'): number[] => {
  let at = 0;
  return SCENES.map((s) => {
    const from = at;
    at += s[cut];
    return from;
  });
};
