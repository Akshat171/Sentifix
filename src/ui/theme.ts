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

/**
 * The Sentifix mark: an unresolved report (the dot) becoming a resolved one
 * (the check). Inline SVG rather than a raster asset so it stays sharp at any
 * size, needs no extra request, and can be reused as the favicon below.
 */
export const BRAND_MARK = `<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="sfx-mark" x1="0" y1="0" x2=".3" y2="1"><stop offset="0" stop-color="#C2643F"/><stop offset="1" stop-color="#9E3A22"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#sfx-mark)"/><circle cx="15" cy="35" r="5.5" fill="#F7F1E8" opacity=".6"/><path d="M15 35l13 10 21-25" fill="none" stroke="#F9F4EC" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** Same mark, URL-encoded for the <link rel="icon"> data URI. */
const FAVICON =
  `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E` +
  `%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='.3' y2='1'%3E` +
  `%3Cstop offset='0' stop-color='%23C2643F'/%3E%3Cstop offset='1' stop-color='%239E3A22'/%3E` +
  `%3C/linearGradient%3E%3C/defs%3E` +
  `%3Crect width='64' height='64' rx='14' fill='url(%23g)'/%3E` +
  `%3Ccircle cx='15' cy='35' r='5.5' fill='%23F7F1E8' opacity='.6'/%3E` +
  `%3Cpath d='M15 35l13 10 21-25' fill='none' stroke='%23F9F4EC' stroke-width='7' ` +
  `stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E`;

export const GITHUB_ICON = `<svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" width="17" height="17"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>`;

/** Monochrome Slack mark — inherits currentColor so it sits inside any button. */
export const SLACK_ICON = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" width="16" height="16"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>`;

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
.brand-mark{width:22px;height:22px;border-radius:5px;flex:none;display:block}
.brand-mark-lg{width:44px;height:44px;border-radius:10px}

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

/** The four dashboard destinations, in the order they appear in the nav. */
const DASHBOARD_NAV = [
  { href: '/dashboard', label: 'Repositories', key: 'repos' },
  { href: '/dashboard/issues', label: 'Issues', key: 'issues' },
  { href: '/dashboard/usage', label: 'Usage', key: 'usage' },
  { href: '/dashboard/keys', label: 'API keys', key: 'keys' },
] as const;

export type DashboardSection = (typeof DASHBOARD_NAV)[number]['key'];

/**
 * Styles for the shared dashboard header.
 *
 * Lives here rather than in each page's <style> block because it was copied
 * into two pages and then diverged: the issue explorer and the usage page grew
 * their own headers with no nav at all, so those two screens were dead ends you
 * could only leave with the back button.
 */
export const NAV_CSS = `
header{background:var(--surface);border-bottom:1px solid var(--line);padding:12px 22px;display:flex;align-items:center;gap:16px;flex-wrap:wrap;flex-shrink:0}
header .brand{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:.875rem;font-weight:600;text-decoration:none;color:inherit}
header nav{display:flex;gap:4px;margin-left:8px}
header nav a{font-size:.8125rem;padding:5px 11px;border-radius:7px;text-decoration:none;color:var(--muted);white-space:nowrap}
header nav a:hover{background:var(--sunk);color:var(--ink)}
header nav a[aria-current]{background:var(--accent-wash);color:var(--accent-text);font-weight:600}
header .user{margin-left:auto;font-size:.8125rem;color:var(--muted)}
header .user a{color:var(--accent-text)}
header .actions{display:flex;gap:8px;align-items:center}
header .user + .actions{margin-left:12px}
header .actions:only-of-type{margin-left:auto}
@media (max-width:640px){
  header nav{margin-left:0;order:3;width:100%}
  header nav a{padding:5px 8px}
}
`;

/**
 * The dashboard header: brand, section nav, then who you are signed in as.
 *
 * `active` marks the current section with aria-current, which is what the nav
 * styles key off — so the highlight and the accessible state can never disagree.
 */
export function dashboardHeader(o: {
  active: DashboardSection;
  /** Pre-rendered user badge, or '' when auth is off. */
  userBadge?: string;
  /** Page-specific controls, e.g. the issue explorer's Refresh button. */
  actions?: string;
}): string {
  const links = DASHBOARD_NAV.map(
    (n) => `<a href="${n.href}"${n.key === o.active ? ' aria-current="page"' : ''}>${n.label}</a>`,
  ).join('\n    ');

  return `
<header>
  <a class="brand" href="/">${BRAND_MARK} Sentifix</a>
  <nav>
    ${links}
  </nav>
  ${o.userBadge ?? ''}
  ${o.actions ? `<div class="actions">${o.actions}</div>` : ''}
</header>`;
}

export function page(o: PageOptions): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="color-scheme" content="light dark">
<title>${o.title}</title>
<link rel="icon" href="${FAVICON}">
<link rel="apple-touch-icon" href="${FAVICON}">
${o.description ? `<meta name="description" content="${o.description}">` : ''}
<style>${THEME_CSS}</style>
${o.head ?? ''}
</head>
<body${o.fullHeight ? ' class="app"' : ''}>
${o.body}
</body>
</html>`;
}
