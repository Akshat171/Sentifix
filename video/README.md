# Sentifix launch video

Remotion source for the launch video. **Independent of the app** — its own
`pnpm-workspace.yaml` makes this directory its own workspace root, so a
`pnpm install` at the repo root never pulls Remotion's Chromium/ffmpeg tree and
CI stays fast. `video/` is excluded from the app's `tsconfig.json` and
`tsconfig.build.json` for the same reason.

```bash
cd video
pnpm install
pnpm studio          # live preview at :3000 — leave running while iterating
pnpm typecheck
```

## Compositions

| ID | Size | Length | Use |
|---|---|---|---|
| `LaunchVideo` | 1920×1080 | 72s | README hero, Product Hunt, HN, X |
| `LaunchVideoVertical` | 1080×1920 | 45s | Reels / Shorts / TikTok |

Both are assembled from the same scene components. The cut lives in
`src/timeline.ts` — retiming the video is one edit there, not seven across the
scene files. A scene with `vertical: 0` is dropped from the vertical cut.

## Status

The timing skeleton is built and renders. Every scene in `src/scenes/` is still
a placeholder — each one imports `SceneSkeleton` and carries a `// TODO:`. Build
them with the prompt in [`../docs/LAUNCH_VIDEO_PROMPT.md`](../docs/LAUNCH_VIDEO_PROMPT.md);
a scene is done when it no longer imports `SceneSkeleton`.

## Assets — required before the scenes can be built

Drop these in `public/`. Capture at 2× DPR, in dark mode, in a clean browser
window at 1440px wide. **Scrub API keys, tokens, installation IDs, and real
customer repo names from every frame before it lands here.**

| File | What |
|---|---|
| `issue-inbox.png` | A real GitHub issues list, 20+ open bugs |
| `issue-detail.png` | One bug report with a stack trace |
| `dashboard.png` | `/dashboard` with several triaged issues |
| `triage-report.png` | The GitHub comment Sentifix posts |
| `pr.png` | The auto-opened PR, Files-changed tab |
| `slack.png` | `@Sentifix` mention + thread reply |
| `diff.txt` | The real unified diff from a good run |
| `eval.json` | A real `eval_results` row — score + breakdown |
| `music.mp3` | 75s bed, quiet, no drop, commercially licensed |

Everything on screen comes from these files. Nothing in the video is invented.

## Render

```bash
pnpm render             # out/sentifix-launch.mp4
pnpm render:vertical    # out/sentifix-launch-9x16.mp4
pnpm render:pipeline    # out/pipeline.mp4 — scene 3 only, muted, for the README
pnpm still              # out/thumbnail.png — last static frame
```

`out/` is gitignored. Review in the studio before rendering; Remotion previews
at full fidelity, so a render only costs time.

## Theme

`src/theme.ts` is a hand-maintained port of the dark token set in the app's
`src/ui/theme.ts`, and `src/components/BrandMark.tsx` ports `BRAND_MARK` from
the same file. If the product palette or mark changes, change these too.
