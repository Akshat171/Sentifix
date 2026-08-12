/**
 * Single source of truth for Sentifix's visual identity.
 *
 * Every HTML surface (landing, setup, dashboard) imports THEME_CSS and the
 * `page()` shell from here, so a theme change is one edit rather than three.
 *
 * Colours are declared as custom properties in three passes so the page
 * resolves correctly in all three viewer states — explicit light, explicit
 * dark, and the default "follow the OS" state, which stamps nothing:
 *   1. bare :root                       → the complete light palette
 *   2. @media (prefers-color-scheme:dark) → dark, guarded so an explicit
 *                                           light choice still wins
 *   3. :root[data-theme="dark"]          → dark again, so a toggle wins too
 * Never declare a colour only inside (2) or (3): it would be undefined in the
 * un-stamped state and the page would render one theme on the other's ground.
 */

export interface PageOptions {
  title: string;
  body: string;
  description?: string;
  /** Extra markup for <head> (page-specific <style>, meta, etc.). */
  head?: string;
  /** App-style viewport-height layout (dashboard) rather than a scrolling document. */
  fullHeight?: boolean;
}

/** Wordmark used across all surfaces. Replaces the old emoji logos. */
export const BRAND_MARK = `<span class="brand-dot" aria-hidden="true"></span>`;

export const GITHUB_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="17" height="17"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

const TOKENS_LIGHT = `
  --ground:#FAF9F7; --surface:#FFFFFF; --sunk:#F3F1ED;
  --ink:#17191C; --muted:#6B6560; --line:#E6E2DD;
  --accent:#C96442; --accent-text:#A0472A; --accent-wash:#FBF0EB;
  --add:#1F6B45; --add-wash:#E9F5EE;
  --del:#93312A; --del-wash:#FAECEA;
  --hunk:#3A5C8A; --hunk-wash:#EBF1F8;
  --sev-critical:#B3261E; --sev-high:#B5540E; --sev-medium:#7E6208; --sev-low:#1F6B45;
  --shadow:0 1px 2px rgb(23 25 28 / .05), 0 12px 32px -12px rgb(23 25 28 / .14);
`;

const TOKENS_DARK = `
  --ground:#121316; --surface:#191B1F; --sunk:#1F2126;
  --ink:#EDEAE6; --muted:#9A948C; --line:#2B2E33;
  --accent:#E08050; --accent-text:#EC9269; --accent-wash:#2A1D17;
  --add:#55C48A; --add-wash:#152A20;
  --del:#E0796C; --del-wash:#2C1A18;
  --hunk:#7FA8DC; --hunk-wash:#182230;
  --sev-critical:#F0776B; --sev-high:#E8994E; --sev-medium:#D8BC55; --sev-low:#55C48A;
  --shadow:0 1px 2px rgb(0 0 0 / .4), 0 12px 32px -12px rgb(0 0 0 / .6);
`;

export const THEME_CSS = `
:root{
${TOKENS_LIGHT}
  --mono:ui-monospace,"SF Mono",SFMono-Regular,"JetBrains Mono",Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${TOKENS_DARK}}}
:root[data-theme="dark"]{${TOKENS_DARK}}

*{box-sizing:border-box;margin:0;padding:0}
body{
  background:var(--ground);color:var(--ink);
  font-family:var(--sans);font-size:17px;line-height:1.65;
  -webkit-font-smoothing:antialiased;
}
body.app{height:100vh;display:flex;flex-direction:column;font-size:15px;overflow:hidden}
h1,h2,h3{font-family:var(--mono);font-weight:600;text-wrap:balance}
h1{font-size:clamp(2.25rem,5.4vw,3.9rem);line-height:1.04;letter-spacing:-.035em}
h2{font-size:clamp(1.65rem,3.1vw,2.35rem);line-height:1.14;letter-spacing:-.028em}
h3{font-size:1.0625rem;line-height:1.35;letter-spacing:-.015em}
a{color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px;border-radius:3px}
code,pre,.mono{font-family:var(--mono)}

/* ── Primitives shared by every surface ─────────────────────────────── */
.wrap{max-width:1140px;margin-inline:auto;padding-inline:24px}
.label{
  font-family:var(--mono);font-size:.6875rem;font-weight:600;
  letter-spacing:.14em;text-transform:uppercase;color:var(--muted);
}
.lede{color:var(--muted);max-width:62ch}

.brand{
  font-family:var(--mono);font-weight:700;font-size:1.0625rem;letter-spacing:-.02em;
  text-decoration:none;display:inline-flex;align-items:center;gap:9px;color:var(--ink);
}
.brand-dot{width:9px;height:9px;border-radius:2px;background:var(--accent);flex:none}

.btn{
  display:inline-flex;align-items:center;gap:9px;
  font-family:var(--sans);font-size:.9375rem;font-weight:600;
  padding:13px 22px;border-radius:8px;text-decoration:none;
  border:1px solid transparent;white-space:nowrap;cursor:pointer;
  transition:background-color .15s ease,border-color .15s ease,transform .15s ease;
}
.btn-primary{background:var(--accent);color:#FFF;box-shadow:var(--shadow)}
.btn-primary:hover{background:var(--accent-text)}
.btn-outline{border-color:var(--line);background:var(--surface);color:var(--ink)}
.btn-outline:hover{border-color:var(--accent)}
.btn-quiet{
  color:var(--muted);font-weight:500;padding-inline:4px;text-decoration:underline;
  text-decoration-color:var(--line);text-underline-offset:5px;background:none;border:none;
}
.btn-quiet:hover{color:var(--ink);text-decoration-color:var(--accent)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-sm{padding:7px 13px;font-size:.8125rem;border-radius:6px}

.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:24px}
.chip{
  font-family:var(--mono);font-size:.6875rem;padding:3px 8px;border-radius:4px;
  background:var(--sunk);color:var(--muted);border:1px solid var(--line);
}

@media (prefers-reduced-motion:no-preference){
  .btn-primary:active{transform:translateY(1px)}
}
`;

export function page(o: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<title>${o.title}</title>
${o.description ? `<meta name="description" content="${o.description}">` : ''}
<style>${THEME_CSS}</style>
${o.head ?? ''}
</head>
<body${o.fullHeight ? ' class="app"' : ''}>
${o.body}
</body>
</html>`;
}
