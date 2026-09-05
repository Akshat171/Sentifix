import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SessionService } from '../auth/session.service';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import {
  DASHBOARD_SHELL_END,
  GITHUB_ICON,
  NAV_CSS,
  SHELL_JS,
  SLACK_ICON,
  dashboardShell,
  page,
} from '../ui/theme';

/**
 * The screen you land on: how much work Sentifix did, how good it was, and
 * what is left in the tank — before you have to click anything.
 *
 * /dashboard used to be the repository list, which answered "is this set up?"
 * but never "is it worth keeping on". Repositories moved to /dashboard/repos
 * and this took its place.
 *
 * Everything here is drawn client-side from the two endpoints the dashboard
 * already exposes (`/api/triage/overview` and `/api/triage/issues`) rather than
 * from TriageService directly: the module boundary in CLAUDE.md rules out the
 * cross-module import, and both endpoints are already session-scoped, so tenant
 * filtering cannot drift out of step with the rest of the dashboard.
 *
 * The charts are CSS boxes, not SVG and not a chart library. Every shape here
 * is a rectangle whose length is a percentage of a total, which is what a flex
 * child with a grow factor already is — a charting dependency would cost more
 * bytes than the whole page.
 */
@Controller('dashboard')
export class OverviewController {
  private readonly authEnabled: boolean;

  constructor(
    config: ConfigService,
    private readonly session: SessionService,
    @InjectRepository(InstallationRepository)
    private readonly repoMap: Repository<InstallationRepository>,
  ) {
    this.authEnabled = config.get<boolean>('DASHBOARD_AUTH') === true;
  }

  @Get()
  async serve(@Req() req: HttpRequest, @Res() reply: HttpReply): Promise<void> {
    let userBadge = '';

    if (this.authEnabled) {
      const sess = this.session.getSession(req);
      if (!sess) {
        reply.code(302).redirect('/auth/login');
        return;
      }

      // Only a genuinely un-onboarded account goes to the connect screen; for
      // them connecting really is the next step and an empty dashboard is not.
      if (!sess.superuser) {
        const connected = sess.installationIds.length
          ? await this.repoMap.count({ where: { installationId: In(sess.installationIds) } })
          : 0;
        if (connected === 0) {
          reply.code(302).redirect('/setup?first=1');
          return;
        }
      }

      userBadge = `<span>${sess.login} · <a href="/auth/logout">Log out</a></span>`;
    }

    reply.type('text/html; charset=utf-8').send(
      page({
        title: 'Sentifix — dashboard',
        description: 'Triage volume, fix quality and remaining credit across your repositories.',
        fullHeight: true,
        head: `<style>
${NAV_CSS}
.integrations{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:11px;margin-bottom:22px}
.intg{display:flex;align-items:center;gap:13px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:15px 17px}
/* A missing integration is the one thing here worth interrupting for, so it
   takes the accent border and the filled button. A connected one goes quiet and
   stops competing with the numbers below it. */
.intg.off{border-color:var(--accent);background:var(--accent-wash)}
.intg .ico{width:36px;height:36px;border-radius:9px;background:var(--sunk);display:flex;align-items:center;justify-content:center;flex:none}
.intg.off .ico{background:var(--surface)}
.intg .what{min-width:0}
.intg .nm{font-family:var(--mono);font-size:.875rem;font-weight:600;display:flex;align-items:center;gap:7px}
.intg .st{font-size:.8125rem;color:var(--muted);margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.intg .go{margin-left:auto;flex:none}
.idot{width:7px;height:7px;border-radius:50%;flex:none}
.idot.on{background:var(--add)}
.idot.no{background:var(--sev-medium)}
main{padding:26px 24px 70px}
.inner{max-width:1180px;margin-inline:auto}

.greet{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.greet h1{font-size:1.5rem;letter-spacing:-.025em;margin:0}
.greet .date{color:var(--muted);font-size:.8125rem;margin-top:5px}

/* ── KPI row ─────────────────────────────────────────────────────────── */
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(216px,1fr));gap:14px;margin-bottom:14px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:15px 17px 14px}
.kpi-top{display:flex;align-items:center;gap:8px;margin-bottom:11px}
.kpi-top .t{font-size:.8125rem;color:var(--muted)}
.kpi-num{display:flex;align-items:baseline;gap:5px;font-family:var(--mono);font-size:1.95rem;font-weight:600;letter-spacing:-.035em;font-variant-numeric:tabular-nums;line-height:1}
.kpi-num small{font-size:.8125rem;font-weight:500;color:var(--muted);letter-spacing:0}
.kpi-foot{display:flex;align-items:flex-end;gap:12px;margin-top:11px}
.kpi-delta{font-family:var(--mono);font-size:.6875rem;color:var(--muted);line-height:1.4}
.kpi-delta b{font-weight:600}
.kpi-delta.up b{color:var(--add)}
.kpi-delta.down b{color:var(--del)}

/* Sparkline: eight flex children with percentage heights. An SVG path or a
   canvas would both need script to size themselves; this needs nothing. */
.spark{margin-left:auto;display:flex;align-items:flex-end;gap:2px;height:26px;flex:none}
.spark i{width:4px;border-radius:1px;background:var(--accent);opacity:.32;min-height:2px}
.spark i:last-child{opacity:.9}

/* ── Charts row ──────────────────────────────────────────────────────── */
.row2{display:grid;gap:14px;margin-bottom:14px}
@media (min-width:1000px){.row2{grid-template-columns:1.62fr 1fr}}
.panel{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:17px 19px 19px;min-width:0}
.panel-head{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.panel-head h2{font-size:.9375rem;letter-spacing:-.015em;margin:0}
.panel-head .more{margin-left:auto;font-size:.75rem;color:var(--muted);text-decoration:none}
.panel-head .more:hover{color:var(--accent-text)}

.chart{display:flex;gap:22px;align-items:stretch}
.chart-side{display:flex;flex-direction:column;gap:15px;flex:none;width:118px}
.chart-side .n{font-family:var(--mono);font-size:1.5rem;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.05}
.chart-side .l{font-size:.75rem;color:var(--muted);margin-top:3px;line-height:1.35}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.75rem;color:var(--muted);margin-bottom:14px}
.legend span{display:flex;align-items:center;gap:6px}
.legend i{width:8px;height:8px;border-radius:50%;flex:none}

/* The plot is a grid of equal columns; each column is a flex row of bars whose
   heights are percentages of the tallest value in the set. */
.plot{flex:1;min-width:0;display:flex;flex-direction:column}
.plot-bars{flex:1;display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:10px;align-items:end;min-height:172px;border-bottom:1px solid var(--line);padding-bottom:1px}
.col{display:flex;align-items:flex-end;justify-content:center;gap:3px;height:100%}
.col b{display:block;width:12px;border-radius:2px 2px 0 0;min-height:2px;transition:height .5s cubic-bezier(.2,.7,.3,1)}
.col .done{background:var(--add)}
.col .fail{background:var(--del)}
.col .open{background:var(--sev-medium)}
.plot-x{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:10px;margin-top:8px;font-family:var(--mono);font-size:.6875rem;color:var(--muted);text-align:center}

/* ── Repository load (Medesk's "Department Load") ────────────────────── */
.load-total{display:flex;align-items:baseline;justify-content:space-between;font-size:.8125rem;color:var(--muted);margin-bottom:9px}
.load-total b{font-family:var(--mono);font-size:1.05rem;color:var(--ink);font-variant-numeric:tabular-nums}
.load-bar{display:flex;gap:3px;height:11px;margin-bottom:15px}
.load-bar i{border-radius:3px;min-width:5px;transition:flex-grow .5s cubic-bezier(.2,.7,.3,1)}
.load-list{display:flex;flex-direction:column;gap:1px}
.load-row{display:flex;align-items:center;gap:9px;font-size:.8125rem;padding:6px 0}
.load-row .sw{width:9px;height:9px;border-radius:50%;flex:none}
.load-row .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.load-row .ct{margin-left:auto;font-family:var(--mono);font-variant-numeric:tabular-nums;flex:none}
.load-row .pc{font-family:var(--mono);font-size:.75rem;color:var(--muted);width:44px;text-align:right;flex:none}

/* ── Bottom row ──────────────────────────────────────────────────────── */
.row3{display:grid;gap:14px}
@media (min-width:1000px){.row3{grid-template-columns:1.62fr 1fr}}
.rows{display:flex;flex-direction:column}
.rowitem{display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line);text-decoration:none;color:inherit;min-width:0}
.rowitem:first-child{border-top:0}
.rowitem:hover .ti{color:var(--accent-text)}
.rowitem .ti{font-size:.8125rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:1}
.rowitem .rp{font-family:var(--mono);font-size:.6875rem;color:var(--muted);white-space:nowrap;flex:none;display:none}
@media (min-width:700px){.rowitem .rp{display:block}}
.sev{font-family:var(--mono);font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;padding:2px 7px;border-radius:4px;flex:none}
.sev.critical{color:var(--sev-critical);background:var(--del-wash)}
.sev.high{color:var(--sev-high);background:var(--sunk)}
.sev.medium{color:var(--sev-medium);background:var(--sunk)}
.sev.low{color:var(--sev-low);background:var(--add-wash)}
.sev.none{color:var(--muted);background:var(--sunk)}
.sc{font-family:var(--mono);font-size:.8125rem;font-variant-numeric:tabular-nums;flex:none;width:38px;text-align:right}

.skel{color:var(--muted);font-family:var(--mono);font-size:.8125rem;padding:34px 0}
.err{color:var(--del);font-size:.875rem;padding:20px 0}
.empty{color:var(--muted);font-size:.8125rem;padding:22px 0}

@media (prefers-reduced-motion:reduce){
  .col b,.load-bar i{transition:none}
}
</style>`,
        body: `
${dashboardShell({
  active: 'home',
  crumb: 'Dashboard',
  userBadge,
  synced: '<span id="synced">syncing…</span>',
  actions: '<a class="btn btn-primary btn-sm" href="/setup">Add repository</a>',
})}
<main>
  <div class="inner" id="root"><p class="skel">Loading your dashboard…</p></div>
</main>
${DASHBOARD_SHELL_END}
<script>${SHELL_JS}</script>
<script>
(function () {
  var root = document.getElementById('root');
  var syncedEl = document.getElementById('synced');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function ago(iso) {
    if (!iso) return 'never';
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  // Six colours, reused round-robin. Past six repositories the tail is folded
  // into one "other" band so the bar never degrades into stripes.
  var HUES = ['var(--accent)', 'var(--hunk)', 'var(--add)', 'var(--sev-medium)',
              'var(--sev-critical)', 'var(--muted)'];

  /** Eight daily buckets, newest on the right. */
  function spark(dates) {
    if (!dates.length) return '<span class="spark"></span>';
    var now = Date.now();
    var b = [0, 0, 0, 0, 0, 0, 0, 0];
    dates.forEach(function (d) {
      var age = Math.floor((now - new Date(d).getTime()) / 86400000);
      if (age >= 0 && age < 8) b[7 - age]++;
    });
    var max = Math.max.apply(null, b) || 1;
    return '<span class="spark" aria-hidden="true">' + b.map(function (v) {
      return '<i style="height:' + Math.round((v / max) * 100) + '%"></i>';
    }).join('') + '</span>';
  }

  function kpi(title, value, unit, delta, dates) {
    return '<div class="kpi">' +
      '<div class="kpi-top"><span class="t">' + title + '</span></div>' +
      '<div class="kpi-num">' + value + (unit ? '<small>' + unit + '</small>' : '') + '</div>' +
      '<div class="kpi-foot">' + delta + spark(dates || []) + '</div>' +
    '</div>';
  }

  // /triage/issues nests the run under latestRun and leaves it null until the
  // first triage starts, so every read of status/severity/score goes through
  // here rather than off the issue itself.
  function runOf(i) { return i.latestRun || {}; }

  /** Four weekly buckets of runs, split by outcome. */
  function weekly(issues) {
    var now = Date.now();
    var week = 604800000;
    var buckets = [0, 1, 2, 3].map(function () { return { done: 0, fail: 0, open: 0 }; });
    issues.forEach(function (i) {
      var run = runOf(i);
      var when = run.startedAt || i.createdAt;
      if (!when) return;
      var idx = 3 - Math.floor((now - new Date(when).getTime()) / week);
      if (idx < 0 || idx > 3) return;
      if (run.status === 'completed') buckets[idx].done++;
      else if (run.status === 'failed') buckets[idx].fail++;
      else buckets[idx].open++;
    });
    return buckets;
  }

  function render(repos, issues) {
    if (!repos.length) {
      root.innerHTML = '<div class="empty">No repositories connected yet. ' +
        '<a href="/setup">Connect one</a> and this fills in as issues arrive.</div>';
      syncedEl.textContent = 'nothing connected';
      return;
    }

    var totIssues = repos.reduce(function (t, r) { return t + r.issues; }, 0);
    var totRuns = repos.reduce(function (t, r) { return t + r.runs; }, 0);
    var totDone = repos.reduce(function (t, r) { return t + r.completed; }, 0);
    var totFail = repos.reduce(function (t, r) { return t + r.failed; }, 0);
    var scored = repos.filter(function (r) { return r.avgScore !== null; });
    var avg = scored.length
      ? (scored.reduce(function (t, r) { return t + r.avgScore; }, 0) / scored.length)
      : null;
    var last = repos.map(function (r) { return r.lastActivity; })
                    .filter(Boolean).sort().reverse()[0] || null;

    syncedEl.textContent = 'synced ' + ago(last);

    var issueDates = issues.map(function (i) { return i.createdAt; }).filter(Boolean);
    var runDates = issues.map(function (i) { return runOf(i).startedAt; }).filter(Boolean);
    var rate = totRuns ? Math.round((totDone / totRuns) * 100) : 0;

    var kpis = '<div class="kpis">' +
      kpi('Issues triaged', totIssues, '',
          '<span class="kpi-delta">across <b>' + repos.length + '</b> repositories</span>',
          issueDates) +
      kpi('Runs completed', totDone, '',
          totFail > 0
            ? '<span class="kpi-delta down"><b>' + totFail + '</b> failed</span>'
            : '<span class="kpi-delta up"><b>none</b> failed</span>',
          runDates) +
      kpi('Avg fix score', avg === null ? '—' : avg.toFixed(2), avg === null ? '' : '/1',
          '<span class="kpi-delta">' + (scored.length
            ? 'over <b>' + scored.length + '</b> scored repo' + (scored.length === 1 ? '' : 's')
            : 'nothing scored yet') + '</span>', []) +
      kpi('Completion rate', rate, '%',
          '<span class="kpi-delta ' + (rate >= 80 ? 'up' : rate >= 50 ? '' : 'down') + '">' +
          '<b>' + totRuns + '</b> runs total</span>', []) +
    '</div>';

    var wk = weekly(issues);
    var wkMax = Math.max.apply(null, wk.map(function (b) {
      return Math.max(b.done, b.fail, b.open);
    })) || 1;
    var bars = wk.map(function (b) {
      function bar(cls, v) {
        return '<b class="' + cls + '" style="height:' + Math.round((v / wkMax) * 100) + '%"></b>';
      }
      return '<span class="col" title="' + b.done + ' completed, ' + b.fail +
        ' failed, ' + b.open + ' in flight">' +
        bar('done', b.done) + bar('fail', b.fail) + bar('open', b.open) + '</span>';
    }).join('');
    var labels = ['3 wks ago', '2 wks ago', 'Last week', 'This week']
      .map(function (l) { return '<span>' + l + '</span>'; }).join('');

    var volume =
      '<section class="panel">' +
        '<div class="panel-head"><h2>Triage volume</h2>' +
          '<a class="more" href="/dashboard/issues">View all ↗</a></div>' +
        '<div class="legend">' +
          '<span><i style="background:var(--add)"></i>Completed</span>' +
          '<span><i style="background:var(--del)"></i>Failed</span>' +
          '<span><i style="background:var(--sev-medium)"></i>In flight</span>' +
        '</div>' +
        '<div class="chart">' +
          '<div class="chart-side">' +
            '<div><div class="n">' + totIssues + '</div><div class="l">Issues all time</div></div>' +
            '<div><div class="n">' + rate + '%</div><div class="l">Completion rate</div></div>' +
            '<div><div class="n">' + totFail + '</div><div class="l">Failed runs</div></div>' +
          '</div>' +
          '<div class="plot">' +
            '<div class="plot-bars">' + bars + '</div>' +
            '<div class="plot-x">' + labels + '</div>' +
          '</div>' +
        '</div>' +
      '</section>';

    var ranked = repos.slice().sort(function (a, b) { return b.runs - a.runs; });
    var shown = ranked.slice(0, 5).map(function (r) {
      return { repoFullName: r.repoFullName, runs: r.runs };
    });
    var rest = ranked.slice(5);
    if (rest.length) {
      shown.push({
        repoFullName: rest.length + ' other repositories',
        runs: rest.reduce(function (t, r) { return t + r.runs; }, 0),
      });
    }
    var loadTotal = shown.reduce(function (t, r) { return t + r.runs; }, 0) || 1;
    var segs = shown.map(function (r, i) {
      return '<i style="flex-grow:' + (r.runs || 0.001) + ';background:' + HUES[i % 6] + '"></i>';
    }).join('');
    var list = shown.map(function (r, i) {
      var pc = ((r.runs / loadTotal) * 100).toFixed(1);
      var name = r.repoFullName.indexOf('/') > -1
        ? r.repoFullName.split('/').slice(1).join('/')
        : r.repoFullName;
      return '<div class="load-row">' +
        '<span class="sw" style="background:' + HUES[i % 6] + '"></span>' +
        '<span class="nm" title="' + esc(r.repoFullName) + '">' + esc(name) + '</span>' +
        '<span class="ct">' + r.runs + '</span>' +
        '<span class="pc">' + pc + '%</span>' +
      '</div>';
    }).join('');

    var load =
      '<section class="panel">' +
        '<div class="panel-head"><h2>Repository load</h2>' +
          '<a class="more" href="/dashboard/repos">Details ↗</a></div>' +
        '<div class="load-total"><span>Total runs</span><b>' + totRuns + '</b></div>' +
        '<div class="load-bar">' + segs + '</div>' +
        '<div class="load-list">' + list + '</div>' +
      '</section>';

    var recent = issues.slice(0, 8);
    var recentRows = recent.length
      ? recent.map(function (i) {
          var run = runOf(i);
          var sev = (run.severity || 'none').toLowerCase();
          var repo = i.repoFullName || '';
          return '<a class="rowitem" href="/dashboard/issues?repo=' + encodeURIComponent(repo) + '">' +
            '<span class="sev ' + esc(sev) + '">' + esc(sev) + '</span>' +
            '<span class="ti">' + esc(i.title || 'Untitled issue') + '</span>' +
            '<span class="rp">' + esc(repo.split('/').slice(1).join('/')) + '</span>' +
            '<span class="sc">' + (run.score === null || run.score === undefined
              ? '—' : Number(run.score).toFixed(2)) + '</span>' +
          '</a>';
        }).join('')
      : '<p class="empty">No issues triaged yet.</p>';

    var busiest = ranked.slice(0, 5).map(function (r) {
      return '<a class="rowitem" href="/dashboard/issues?repo=' + encodeURIComponent(r.repoFullName) + '">' +
        '<span class="ti">' + esc(r.repoFullName.split('/').slice(1).join('/')) + '</span>' +
        '<span class="sc">' + (r.avgScore === null ? '—' : r.avgScore.toFixed(2)) + '</span>' +
      '</a>';
    }).join('');

    var bottom =
      '<div class="row3">' +
        '<section class="panel">' +
          '<div class="panel-head"><h2>Recent issues</h2>' +
            '<a class="more" href="/dashboard/issues">View all ↗</a></div>' +
          '<div class="rows">' + recentRows + '</div>' +
        '</section>' +
        '<section class="panel">' +
          '<div class="panel-head"><h2>Busiest repositories</h2></div>' +
          '<div class="rows">' + busiest + '</div>' +
        '</section>' +
      '</div>';

    root.innerHTML =
      '<div id="integrations"></div>' +
      '<div class="greet"><div>' +
        '<h1>' + greeting() + '</h1>' +
        '<div class="date">' + new Date().toLocaleDateString(undefined, {
          weekday: 'long', month: 'short', day: 'numeric',
        }) + '</div>' +
      '</div></div>' + kpis + '<div class="row2">' + volume + load + '</div>' + bottom;

    // render() owns #root, so anything already drawn into the placeholder is
    // gone by now — ask for it again rather than racing the two fetches.
    fetch('/dashboard/integrations')
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(renderIntegrations)
      .catch(function () {});
  }

  function intgCard(o) {
    return '<div class="intg' + (o.off ? ' off' : '') + '">' +
      '<span class="ico">' + o.icon + '</span>' +
      '<div class="what">' +
        '<div class="nm"><span class="idot ' + (o.off ? 'no' : 'on') + '"></span>' + o.name + '</div>' +
        '<div class="st">' + esc(o.state) + '</div>' +
      '</div>' +
      '<a class="btn btn-sm go ' + (o.primary ? 'btn-primary' : 'btn-outline') + '" href="' + o.href + '">' +
        esc(o.cta) + '</a>' +
    '</div>';
  }

  function renderIntegrations(d) {
    var el = document.getElementById('integrations');
    if (!el || !d) return;

    var cards = [intgCard({
      off: !d.github.connected,
      icon: ${JSON.stringify(GITHUB_ICON)},
      name: 'GitHub',
      state: d.github.connected
        ? d.github.repos + ' repositor' + (d.github.repos === 1 ? 'y' : 'ies') + ' connected'
        : 'No repositories connected yet',
      cta: d.github.connected ? 'Manage' : 'Install on GitHub',
      href: '/setup',
      primary: !d.github.connected,
    })];

    // Hidden when the deployment has no Slack credentials: offering a button
    // that cannot work is worse than not mentioning Slack at all.
    if (d.slack.available) {
      var names = d.slack.workspaces.map(function (w) { return w.teamName || w.teamId; });
      cards.push(intgCard({
        off: !d.slack.connected,
        icon: ${JSON.stringify(SLACK_ICON)},
        name: 'Slack',
        state: d.slack.connected ? names.join(', ') : 'Report bugs with @sentifix in any channel',
        cta: d.slack.connected ? 'Add another' : 'Add to Slack',
        href: '/slack/install',
        primary: !d.slack.connected,
      }));
    }

    el.innerHTML = '<div class="integrations">' + cards.join('') + '</div>';
  }

  // Loaded independently of the KPI data: a slow or failing integrations lookup
  // must not keep the dashboard itself off the screen.
  fetch('/dashboard/integrations')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(renderIntegrations)
    .catch(function () {});

  Promise.all([
    fetch('/triage/overview'),
    fetch('/triage/issues'),
  ]).then(function (rs) {
    // Matches the other dashboard pages: an expired session bounces to login
    // rather than rendering an error the customer can do nothing about.
    if (rs.some(function (r) { return r.status === 401; })) {
      window.location.href = '/auth/login';
      return null;
    }
    if (rs.some(function (r) { return !r.ok; })) throw new Error('request failed');
    return Promise.all(rs.map(function (r) { return r.json(); }));
  }).then(function (d) {
    if (!d) return;
    render(d[0] || [], d[1] || []);
  }).catch(function () {
    syncedEl.textContent = 'sync failed';
    root.innerHTML = '<p class="err">Could not load your dashboard. ' +
      '<button class="btn-quiet" onclick="location.reload()">Retry</button></p>';
  });
})();
</script>`,
      }),
    );
  }
}
