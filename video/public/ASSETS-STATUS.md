# Asset status — captured 2026-08-20

## Captured, real
| File | Source | Caveat |
|---|---|---|
| `diff.txt` | run `90839933`, `proposedDiff` via `GET /triage/issues/:id/runs` | Genuine model output. 51 lines, 3 files, 12 additions / 3 deletions. |
| `eval.json` | same run, `evalResults[0]`, flattened | Genuine judge output. score 0.975; correctness 1, completeness 1, safety 1, clarity 0.9. Judge: gpt-4o-mini. |
| `dashboard.jpg` | `/dashboard`, local, 1372×885 | **Contains `acme/my-api`** — the synthetic repo from `scripts/test-pipeline.ts`. Crop or re-capture without that row. |
| `triage-report.jpg` | `/dashboard/issues`, the one completed run | Real pipeline output, but the **input issue was synthetic** — see below. |

## The honesty caveat on this run
The only completed run in the local DB (2026-07-01) was triggered by the demo
payload in `scripts/test-pipeline.ts` / `simulate-webhook.sh`. So:

- The classification, root cause, diff, and eval score are **genuine model output**.
- The **input issue was written for testing**, and its file paths
  (`src/auth/auth.service.ts`, `src/auth/token.service.ts`) **do not exist in
  Sentifix**. They belong to the fictional app in the test payload.

Showing these paths in a launch video implies a codebase that isn't yours. Either
frame it as a demo, or re-run the pipeline against a real indexed repo once model
credits are available and replace `diff.txt` / `eval.json`.

## Blocked
A fresh run needs OpenAI credits — indexing died on
`429 You have no credits remaining`. Embeddings always go to OpenAI
(`src/llm/llm.provider.ts:18`), so `LLM_PROVIDER=bedrock` does not work around it.

A worktree at the pre-fix commit is staged and ready to index the moment credits
are added — it contains the real `d207d78` auth-redirect bug:
`git worktree list` → `sentifix-at-bug` @ `bc9c5e6`

Then: `pnpm index:local --repo <worktree> --name Akshat171/sentifix --max-files 300`

## Still missing
`issue-inbox`, `issue-detail`, `pr`, `slack`, `music.mp3`. Scenes 1, 5, and the
audio bed cannot be built without them.

## Resolution note
Captures are 1372×885 JPEG (viewport). The manifest targets 2× PNG. Good enough to
block out scenes 1/5/6; re-capture before the final render. Scenes 3 and 4 don't
need screenshots at all — they render natively from `diff.txt` and `eval.json`.

## Update — scenes built
All seven scenes now render from `src/generated/run-data.ts`. Notes:

- `dashboard-real.jpg` is `dashboard.jpg` cropped to its top 372px, which removes
  the synthetic `acme/my-api` row. Scene 5 uses the cropped file; the uncropped
  original is kept for reference. Re-crop if you recapture.
- Scene 1 renders the seven real inbox issues as native type rather than a
  screenshot, so `issue-inbox.png` and `issue-detail.png` are no longer needed.
- Scene 5 renders the three delivery surfaces natively, so `pr.png` and
  `slack.png` are no longer needed either.
- `music.mp3` is still absent and no `<Audio>` tag is mounted. The cut is silent.
