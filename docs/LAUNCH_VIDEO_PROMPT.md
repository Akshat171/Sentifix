# Sentifix launch video — plan + build prompt

Target: **72s / 1920×1080 / 30fps** hero cut for the README + Product Hunt/HN/X,
plus a **9:16 45s** cut for socials. Remotion 4, TypeScript, no voiceover in v1
(kinetic type + music), dark theme.

---

## Step 0 — Scaffold — DONE

`video/` is built and rendering. It is its own pnpm workspace root (own
`pnpm-workspace.yaml`), so a `pnpm install` at the repo root never pulls
Remotion's Chromium/ffmpeg tree and CI stays fast. `video/` is also excluded
from the app's `tsconfig.json` and `tsconfig.build.json` — without that,
`nest build` tries to compile the `.tsx` scenes and fails.

What exists:

- Remotion 4.0.514, React 19, `pnpm typecheck` clean.
- `LaunchVideo` (1920×1080, 2160f) and `LaunchVideoVertical` (1080×1920, 1350f),
  both listed by `remotion compositions` and rendering stills.
- `src/timeline.ts` — the cut as data. Retiming is one edit here.
- `src/theme.ts` + `src/components/BrandMark.tsx` — the dark palette and the
  dot→check mark, ported from the app's `src/ui/theme.ts`.
- `src/fonts.ts` — Inter + JetBrains Mono, weights pinned. Loading them bare
  fires 126 requests per render; add a weight here only when a scene needs it.
- `src/scenes/*.tsx` — seven placeholders. A scene is done when it no longer
  imports `SceneSkeleton`.

```bash
cd video && pnpm studio      # :3000, leave running while iterating
```

---

## Step 1 — Capture real assets BEFORE writing any animation

This is the single biggest quality lever. A launch video made of real product
frames reads as shipped software; one made of synthetic mockups reads as a
concept deck. Drop these into `video/public/`:

| File | What | How |
|---|---|---|
| `issue-inbox.png` | A real GitHub issues list, 20+ open bugs | Any busy OSS repo, or your own |
| `issue-detail.png` | One bug report with a stack trace | The issue you'll triage on camera |
| `dashboard.png` | `/dashboard` with several triaged issues | Run locally or use sentifix.dev |
| `triage-report.png` | The GitHub comment Sentifix posts | Real run output |
| `pr.png` | The auto-opened PR, Files-changed tab | Real run output |
| `slack.png` | `@Sentifix` mention + thread reply | Real run output |
| `diff.txt` | The actual unified diff from a good run | Copy from a `runs` row |
| `eval.json` | A real eval_results row (score + breakdown) | Copy from Postgres |
| `music.mp3` | 75s bed, quiet, no drop | Epidemic Sound / Uppbeat (check the license) |

Capture at **2× DPR** (retina) so 1080p downscales crisply, in **dark mode**, at
a 1440px-wide window, with a clean browser (no bookmarks bar, no extensions).
Real strings only — never invent a fake customer name or a fake metric.

---

## Step 2 — The prompt

Paste everything in the block below into Claude Code from the repo root, after
the assets are in `video/public/`.

```
Build the Sentifix launch video in ./video using Remotion 4 + TypeScript.

## What already exists — build on it, do not recreate it
./video is a working Remotion 4 project: both compositions are registered in
src/Root.tsx and assembled in src/LaunchVideo.tsx from src/timeline.ts; the
palette is in src/theme.ts, the mark in src/components/BrandMark.tsx, the fonts
in src/fonts.ts. Read all five before you start.

Your job is the seven scene files in src/scenes/. Each currently renders
<SceneSkeleton/>; replace each body with the real scene. Do not change the
composition IDs or the token values in src/theme.ts. You may retime a scene by
editing src/timeline.ts, provided the totals stay at 2160 landscape / 1350
vertical. Delete src/components/SceneSkeleton.tsx once no scene imports it.

## Output
- LaunchVideo: 1920x1080, 30fps, 2160 frames (72s).
- LaunchVideoVertical: 1080x1920, 30fps, 1350 frames (45s) — same scene
  components, scene 6 dropped, the rest tightened. Every scene must read
  useVideoConfig() for its dimensions and hold its layout at both aspects.

## Brand — already ported into video/src/theme.ts; import THEME, never hardcode
For reference, the token values are:
ground #121316, surface #191B1F, sunk #1F2126, ink #EDEAE6, muted #9A948C,
line #2B2E33, accent #E08050, accentText #EC9269, accentWash #2A1D17,
add #55C48A / addWash #152A20, del #E0796C / delWash #2C1A18,
hunk #7FA8DC / hunkWash #182230,
severity: critical #F0776B, high #E8994E, medium #D8BC55, low #55C48A.
The mark is <BrandMark size progress/> — an unresolved report (dot) becoming a
resolved one (check). Its `progress` prop drives the stroke draw, so scene 2's
reveal and the corner watermark are the same component.
Fonts: SANS and MONO from src/fonts.ts. Inter for headlines, JetBrains Mono for
all code, paths, diffs, and metrics. No other font, no other loader.

## Scenes
Frame ranges below are absolute in the landscape cut, for orientation. Each
scene is wrapped in its own <Sequence>, so inside a scene component
useCurrentFrame() starts at 0 — write every scene against its local frame.

1. THE PILE — 0-150 (5s)
   issue-inbox.png drifts up slowly behind a dark scrim. Issue rows stack in
   from the bottom, accelerating, until they overflow the frame. A mono counter
   ticks 12 -> 487. Headline: "Bug reports arrive faster than anyone can read
   them." Cut hard to black on the last frame.

2. MARK — 150-300 (5s)
   On black: the dot draws in, then the check strokes through it (animate SVG
   stroke-dashoffset, spring, damping 200). Wordmark "Sentifix" wipes in from
   the mark. Sub: "AI triage for your GitHub issues." Hold, then the mark
   shrinks to a persistent corner watermark for the rest of the video.

3. THE PIPELINE — 300-1080 (26s) — this is the film; give it the most care
   Build a horizontal 5-node LangGraph rail that stays on screen the whole
   scene: classify -> retrieve -> diagnose -> retrieveTargeted -> proposeFix.
   The active node glows accent, completed nodes go add-green, the connecting
   edge animates a travelling pulse. Camera pans/zooms to the active node
   (one shared spring-driven transform, not per-scene cuts).
   - classify: issue-detail.png on the left; on the right, chips land one by
     one with a spring — severity CRITICAL (sev-critical), category, then
     3 affected components.
   - retrieve: two result columns fall in side by side, labelled BM25 and
     VECTOR, each a list of real repo paths in mono. They then interleave and
     collapse into one RRF-fused column, re-ranked, top 3 highlighted accent.
     Caption: "hybrid search + HyDE + stack-trace hits".
   - diagnose: the root-cause paragraph types out character by character in
     mono (steady ~45 chars/sec, no per-char randomness), with the cited
     file:line refs highlighted as they appear.
   - retrieveTargeted: a fast second pass — the rail pulses back to retrieve
     and returns, 2 new files slot into the context column. 2s, no more.
   - proposeFix: read video/public/diff.txt at build time and render it as a
     real unified diff — hunk headers in hunk/hunkWash, + lines add/addWash,
     - lines del/delWash — revealing line by line, 3 frames apart.

4. THE JUDGE — 1080-1320 (8s)
   The diff shrinks to the left third. Four radial meters sweep in on the
   right: correctness, completeness, safety, clarity — values from
   video/public/eval.json, animated with interpolate + Easing.out(Easing.cubic).
   The composite score counts up in the centre. Caption: "every patch is
   scored by an LLM-as-judge before a human sees it."

5. DELIVERY — 1320-1650 (11s)
   The scored diff splits into three cards that fan out to the thirds:
   triage-report.png (GitHub comment), pr.png (PR opened), slack.png (Slack
   thread reply). Each lands with a spring and a small label. Then all three
   settle into dashboard.png, which fills the frame. Caption: "posted back
   where your team already works."

6. THE BUILD — 1650-1920 (9s)
   Tight grid of stack labels, set in mono, fading in on a stagger:
   NestJS · Fastify · TypeScript · LangGraph.js · PostgreSQL 16 + pgvector ·
   tsvector BM25 · Redis · RabbitMQ · TypeORM · Octokit · OpenTelemetry.
   Under it, three claims, one at a time: "MIT licensed." /
   "Self-hosted or one-click deploy." / "Your code never leaves your infra."

7. CTA — 1920-2160 (8s)
   Centred, generous whitespace. Mark, then a mono terminal block that types:
     git clone https://github.com/Akshat171/sentifix
     docker compose up -d
   Then sentifix.dev and github.com/Akshat171/sentifix as static lines.
   Final frame holds 30 frames, fully static, safe as a thumbnail.

## Motion rules — follow these, they are what separates this from a slide deck
- Position/scale/opacity: spring({fps, frame, config:{damping: 200}}). Never
  linear, never the default bouncy spring.
- Numbers and meters: interpolate with Easing.out(Easing.cubic).
- Everything enters and settles; nothing pulses, floats, or loops idly.
- Never move more than two things at once. Stillness sells the busy moments.
- No cross-dissolves between scenes — hard cuts, or a 6-frame accent wipe.
- All copy inside a 120px safe margin; nothing near a frame edge.
- Text on screen >= 36px at 1080p (>= 52px in the vertical cut).
- Read timing off `useCurrentFrame()`; never setTimeout/setInterval/Date.now.
- All assets from staticFile(). No network requests, no CDN fonts, no icon
  packs — inline every SVG.
- Audio: <Audio src={staticFile("music.mp3")} volume={0.35} /> with a 20-frame
  fade in and a 45-frame fade out. If music.mp3 is absent, skip the Audio tag
  entirely rather than erroring.

## Content rules
- Every path, diff, score, and log line must come from the real files in
  video/public/. Invent nothing. No fake metrics ("10x faster", "saves 40
  hours"), no fake logos, no fake customer names, no fabricated testimonials.
- Copy is plain and declarative. No exclamation marks, no "revolutionary",
  no "game-changing", no emoji anywhere in the video.

## Deliverables
- `pnpm typecheck` clean and `npx remotion compositions` listing both comps
  with zero console errors or warnings.
- A still rendered from each scene, so I can check every frame range:
  `npx remotion still LaunchVideo out/check-<n>.png --frame=<mid-frame>`.
- Do not run the full video render — report when the stills are clean and let
  me review in the studio first.
```

---

## Step 3 — Iterate, then render

Review in the studio, scene by scene, before rendering anything — Remotion
previews at full fidelity, so a render only costs you time.

```bash
cd video
pnpm exec remotion render LaunchVideo         out/sentifix-launch.mp4 --codec=h264 --crf=18
pnpm exec remotion render LaunchVideoVertical out/sentifix-launch-9x16.mp4 --codec=h264 --crf=18
pnpm exec remotion still  LaunchVideo         out/thumbnail.png --frame=2150
```

For the README, also render a silent, looping GIF-style clip of scene 3 alone —
the pipeline is the thing people need to see, and it should autoplay:

```bash
pnpm exec remotion render LaunchVideo out/pipeline.mp4 --frames=300-1080 --muted
```

## If you want narration later
Record the VO first, then re-time the scenes to the waveform — never the other
way round. `@remotion/media-utils` `useAudioData` + `visualizeAudio` will give
you the waveform to cut against, and it can drive a subtle level meter under
the CTA. 72s is roughly 180 spoken words.

## Watch out for
- **Music licensing** — a Product Hunt/X launch is commercial use. Uppbeat free
  tier and most YouTube Audio Library tracks are fine; random SoundCloud is not.
- **Secrets in screenshots** — scrub API keys, tokens, installation IDs, real
  customer repo names, and the `X-Api-Key` header from every captured frame
  before it goes in `public/`.
- **Text-heavy frames** hold longer than you think: ~2.5s minimum per line of
  copy, and the diff needs a full 4s of stillness after it finishes drawing.
