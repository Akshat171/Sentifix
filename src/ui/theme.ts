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

/* ── Cross-document view transitions ────────────────────────────────── */
/* Every surface here is a separately server-rendered document, so moving
   between them is a full page load: the screen goes blank for a frame and
   the header is torn down and rebuilt even on the dashboard, where all four
   pages share it exactly. Opting in lets the browser cross-fade the two
   documents instead, and anything carrying a view-transition-name is matched
   across the navigation rather than redrawn — see NAV_CSS, which pins the
   dashboard header and slides the active-section pill between links.
   Browsers without the feature ignore the at-rule and navigate as before. */
@view-transition{navigation:auto}
::view-transition-old(root){animation:sfxRootOut .16s linear both}
::view-transition-new(root){animation:sfxRootIn .26s cubic-bezier(.2,.7,.3,1) both}
@keyframes sfxRootOut{to{opacity:0}}
@keyframes sfxRootIn{from{opacity:0;transform:translateY(8px)}}

/* A transition is motion nobody asked for, so honour the OS setting by
   collapsing it to nothing — not by falling back to the blank frame. */
@media (prefers-reduced-motion:reduce){
  ::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){
    animation:none !important;
  }
}
`;

/**
 * Nav icons. Stroke-only 16px glyphs on a shared 16-box, so they sit on the
 * same optical weight as the mono labels beside them and inherit currentColor
 * with the link rather than needing a second colour rule per state.
 */
const NAV_ICON = {
  home: `<path d="M2 2.5h4.2v4.2H2zM9.8 2.5H14v4.2H9.8zM2 9.3h4.2v4.2H2zM9.8 9.3H14v4.2H9.8z"/>`,
  repo: `<path d="M3.4 2.2h9.2v11.6H4.6a1.2 1.2 0 0 1-1.2-1.2zM3.4 11.2h9.2"/>`,
  issue: `<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="1.6" fill="currentColor" stroke="none"/>`,
  usage: `<path d="M2.6 13.4h10.8M4.8 13.4V8.2M8 13.4V3.4M11.2 13.4v-3.6"/>`,
  key: `<circle cx="5.4" cy="8" r="2.9"/><path d="M8.3 8h5.3M11.6 8v2.4"/>`,
} as const;

/**
 * The dashboard destinations, grouped the way the sidebar shows them.
 *
 * Grouping is what makes a sidebar readable once it passes about four items:
 * "Repositories" and "Issues" are things you operate on, "Usage" is something
 * you read, and "API keys" is account plumbing. Flattening them back into one
 * list would make the sidebar longer than the old top nav for no gain.
 */
export type DashboardSection = 'home' | 'repos' | 'issues' | 'usage' | 'keys';

interface NavItem {
  href: string;
  label: string;
  key: DashboardSection;
  icon: keyof typeof NAV_ICON;
}

/* Annotated rather than `as const`: the literal tuple types that produces make
   every group a different type, so flatMap over the groups widens to {} and
   the icon lookup stops type-checking. */
const DASHBOARD_NAV: ReadonlyArray<{ group: string; items: readonly NavItem[] }> = [
  {
    group: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', key: 'home', icon: 'home' }],
  },
  {
    group: 'Operations',
    items: [
      { href: '/dashboard/repos', label: 'Repositories', key: 'repos', icon: 'repo' },
      { href: '/dashboard/issues', label: 'Issues', key: 'issues', icon: 'issue' },
    ],
  },
  {
    group: 'Insights',
    items: [{ href: '/dashboard/usage', label: 'Usage', key: 'usage', icon: 'usage' }],
  },
  {
    group: 'Account',
    items: [{ href: '/dashboard/keys', label: 'API keys', key: 'keys', icon: 'key' }],
  },
];

/**
 * Styles for the shared dashboard header.
 *
 * Lives here rather than in each page's <style> block because it was copied
 * into two pages and then diverged: the issue explorer and the usage page grew
 * their own headers with no nav at all, so those two screens were dead ends you
 * could only leave with the back button.
 */
export const NAV_CSS = `
/* ── App shell: fixed sidebar, scrolling pane ────────────────────────── */
/* body.app is already a 100vh flex column with overflow hidden, so the shell
   takes the remaining row and only <main> scrolls. min-height/min-width 0 on
   the flex children is what stops a wide table inside main from pushing the
   sidebar off screen instead of scrolling itself. */
.shell{display:flex;flex:1;min-height:0}
.pane{display:flex;flex-direction:column;flex:1;min-width:0}
main{overflow-y:auto;flex:1;min-height:0}

.side{
  width:216px;flex:none;display:flex;flex-direction:column;
  background:var(--surface);border-right:1px solid var(--line);
  transition:width .18s cubic-bezier(.2,.7,.3,1);overflow:hidden;
}
.side-top{display:flex;align-items:center;gap:9px;height:53px;padding:0 14px;flex:none}
.side-top .brand{font-size:.9375rem;overflow:hidden;white-space:nowrap}
.side-toggle{
  margin-left:auto;background:none;border:0;color:var(--muted);cursor:pointer;
  padding:5px;border-radius:6px;line-height:0;flex:none;
}
.side-toggle:hover{background:var(--sunk);color:var(--ink)}
.side-toggle svg{transition:transform .18s cubic-bezier(.2,.7,.3,1)}

.side nav{display:flex;flex-direction:column;gap:1px;padding:6px 10px;overflow-y:auto;flex:1}
.side-group{
  font-family:var(--mono);font-size:.625rem;font-weight:600;letter-spacing:.12em;
  text-transform:uppercase;color:var(--muted);padding:14px 8px 5px;white-space:nowrap;
}
.side nav a{
  display:flex;align-items:center;gap:10px;position:relative;
  font-size:.8125rem;padding:7px 8px;border-radius:7px;
  text-decoration:none;color:var(--muted);white-space:nowrap;
}
.side nav a svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.side nav a:hover{background:var(--sunk);color:var(--ink)}
.side nav a[aria-current]{background:var(--accent-wash);color:var(--accent-text);font-weight:600}
.side-foot{
  border-top:1px solid var(--line);padding:11px 14px;font-size:.75rem;
  color:var(--muted);white-space:nowrap;overflow:hidden;flex:none;
}
.side-foot a{color:var(--accent-text)}

/* Collapsed: icons only. The labels are hidden rather than removed so the
   sidebar can animate its width instead of snapping, and the group headings
   collapse to a hairline so the icon groups stay visually separated. */
.shell.tight .side{width:57px}
.shell.tight .side-top .brand span,
.shell.tight .side nav a span,
.shell.tight .side-foot span{display:none}
.shell.tight .side-group{
  font-size:0;padding:9px 8px 4px;
}
.shell.tight .side-group::after{
  content:"";display:block;height:1px;background:var(--line);
}
.shell.tight .side-toggle svg{transform:rotate(180deg)}
.shell.tight .side-top{padding-inline:11px}
.shell.tight .side-top .brand{margin-inline:auto}
.shell.tight .side-toggle{position:absolute;left:-9999px}
.shell.tight .side:hover .side-toggle{position:static;margin-left:0}
.shell.tight .side:hover .brand{display:none}

/* ── Top bar ─────────────────────────────────────────────────────────── */
.topbar{
  display:flex;align-items:center;gap:12px;height:53px;padding:0 20px;flex:none;
  border-bottom:1px solid var(--line);background:var(--surface);
}
.crumb{display:flex;align-items:center;gap:8px;font-size:.875rem;font-weight:600;letter-spacing:-.01em}
.crumb svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round;opacity:.55}
.synced{display:none;font-size:.75rem;color:var(--muted);align-items:center;gap:6px}
.synced::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--add);flex:none}
@media (min-width:720px){.synced{display:flex}}
.topsearch{
  margin-left:auto;display:none;align-items:center;gap:8px;
  background:var(--sunk);border:1px solid var(--line);border-radius:8px;
  padding:6px 9px;font:inherit;font-size:.8125rem;color:var(--muted);
  cursor:pointer;min-width:236px;text-align:left;
}
.topsearch:hover{border-color:var(--accent)}
.topsearch kbd{
  margin-left:auto;font-family:var(--mono);font-size:.6875rem;
  background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:1px 5px;
}
@media (min-width:820px){.topsearch{display:flex}}
.topbar .actions{display:flex;gap:8px;align-items:center}
.topsearch + .actions{margin-left:12px}
.topbar .actions:last-child:not(.topsearch + .actions){margin-left:auto}

@media (max-width:640px){
  .side{position:absolute;left:-9999px}
  .shell{flex-direction:column}
}

/* ── Carried across a dashboard navigation rather than repainted ─────── */
/* The sidebar and top bar are identical on every dashboard page, so naming
   them holds both perfectly still while only the pane underneath cross-fades.
   The pill gets its own name, and because exactly one link is ever
   aria-current the name stays unique within each document — which is what
   lets the browser read the two as the same box and slide it between
   sections instead of blinking it. */
.side{view-transition-name:sfx-sidebar}
.topbar{view-transition-name:sfx-topbar}
.side nav a[aria-current]{view-transition-name:sfx-navpill}
/* Short, because the label inside the pill is stretched by the morph and a
   long one makes that legible. */
::view-transition-old(sfx-navpill),::view-transition-new(sfx-navpill){animation-duration:.2s}
`;

/**
 * The dashboard shell: grouped sidebar, top bar, and the scrolling pane your
 * page content goes into.
 *
 * `active` marks the current section with aria-current, which is what both the
 * nav styles and the view-transition pill key off — so the highlight, the
 * accessible state and the thing that animates can never disagree.
 *
 * Returns an unclosed pane on purpose: callers append their <main> and then
 * `DASHBOARD_SHELL_END`. Passing the body in as a string instead would mean
 * every caller building its markup one level deeper for no benefit.
 */
export function dashboardShell(o: {
  active: DashboardSection;
  /** Breadcrumb label for the top bar — usually the section name. */
  crumb: string;
  /** Pre-rendered user badge, or '' when auth is off. */
  userBadge?: string;
  /** Page-specific controls, e.g. the issue explorer's Refresh button. */
  actions?: string;
  /** Right-hand status text, e.g. "synced 2m ago". Omitted when absent. */
  synced?: string;
}): string {
  const groups = DASHBOARD_NAV.map((g) => {
    const links = g.items
      .map(
        (n) =>
          `<a href="${n.href}"${n.key === o.active ? ' aria-current="page"' : ''}>` +
          `<svg viewBox="0 0 16 16" aria-hidden="true">${NAV_ICON[n.icon]}</svg>` +
          `<span>${n.label}</span></a>`,
      )
      .join('\n      ');
    return `<p class="side-group">${g.group}</p>\n      ${links}`;
  }).join('\n      ');

  const crumbIcon =
    DASHBOARD_NAV.flatMap((g) => g.items).find((n) => n.key === o.active)?.icon ?? 'home';

  return `
<div class="shell" id="shell">
  <aside class="side">
    <div class="side-top">
      <a class="brand" href="/">${BRAND_MARK}<span>Sentifix</span></a>
      <button class="side-toggle" type="button" id="side-toggle"
              aria-label="Collapse sidebar" aria-expanded="true">
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor"
             stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M9.5 4.5 6 8l3.5 3.5M13 4.5 9.5 8l3.5 3.5"/>
        </svg>
      </button>
    </div>
    <nav aria-label="Dashboard">
      ${groups}
    </nav>
    ${o.userBadge ? `<div class="side-foot">${o.userBadge}</div>` : ''}
  </aside>
  <div class="pane">
    <header class="topbar">
      <span class="crumb">
        <svg viewBox="0 0 16 16" aria-hidden="true">${NAV_ICON[crumbIcon]}</svg>${o.crumb}
      </span>
      ${o.synced ? `<span class="synced">${o.synced}</span>` : ''}
      <button class="topsearch" type="button" id="topsearch">
        Search issues, repositories… <kbd>⌘K</kbd>
      </button>
      ${o.actions ? `<div class="actions">${o.actions}</div>` : ''}
    </header>`;
}

/** Closes the pane and shell opened by `dashboardShell`. */
export const DASHBOARD_SHELL_END = `  </div>
</div>`;

/**
 * Sidebar collapse + the ⌘K jump, shared by every dashboard page.
 *
 * The collapsed state is written to localStorage and re-applied before paint
 * by the inline read below, so navigating between sections does not flash the
 * sidebar open and shut again on every page load.
 */
export const SHELL_JS = `
(function () {
  var shell = document.getElementById('shell');
  var btn = document.getElementById('side-toggle');
  if (!shell || !btn) return;

  function apply(tight) {
    shell.classList.toggle('tight', tight);
    btn.setAttribute('aria-expanded', tight ? 'false' : 'true');
    btn.setAttribute('aria-label', tight ? 'Expand sidebar' : 'Collapse sidebar');
  }

  var stored = null;
  try { stored = localStorage.getItem('sfx-side'); } catch (e) { /* private mode */ }
  apply(stored === 'tight');

  btn.addEventListener('click', function () {
    var tight = !shell.classList.contains('tight');
    apply(tight);
    try { localStorage.setItem('sfx-side', tight ? 'tight' : 'wide'); } catch (e) { /* ignore */ }
  });

  // The issue explorer owns the only real search box, so the shortcut takes you
  // there rather than duplicating a second index behind a palette.
  var search = document.getElementById('topsearch');
  function jump() {
    var box = document.getElementById('q');
    if (box) { box.focus(); box.select(); return; }
    location.href = '/dashboard/issues?focus=1';
  }
  if (search) search.addEventListener('click', jump);
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); jump(); }
  });
})();
`;

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
