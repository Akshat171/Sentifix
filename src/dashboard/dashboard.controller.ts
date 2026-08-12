import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SessionService } from '../auth/session.service';
import { BRAND_MARK, page } from '../ui/theme';

@Controller('dashboard')
export class DashboardController {
  private readonly authEnabled: boolean;

  constructor(
    config: ConfigService,
    private readonly session: SessionService,
  ) {
    this.authEnabled = config.get<boolean>('DASHBOARD_AUTH') === true;
  }

  @Get()
  serve(@Req() req: HttpRequest, @Res() reply: HttpReply): void {
    let userBadge = '';
    if (this.authEnabled) {
      const sess = this.session.getSession(req);
      if (!sess) {
        reply.code(302).redirect('/auth/login');
        return;
      }
      userBadge = `<span class="user">${sess.login} · <a href="/auth/logout">Log out</a></span>`;
    }

    const html = page({
      title: 'Sentifix — dashboard',
      fullHeight: true,
      head: `<style>
header{background:var(--surface);border-bottom:1px solid var(--line);padding:12px 22px;display:flex;align-items:center;gap:12px;flex-shrink:0}
header .brand{font-size:.9375rem}
header .tagline{font-family:var(--mono);font-size:.6875rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.user{margin-left:auto;font-size:.8125rem;color:var(--muted)}
.user a{color:var(--accent-text)}
.refresh-btn{margin-left:auto;background:var(--surface);border:1px solid var(--line);color:var(--ink);padding:6px 12px;border-radius:6px;cursor:pointer;font-size:.8125rem;font-family:var(--sans)}
.user + .refresh-btn{margin-left:12px}
.refresh-btn:hover{border-color:var(--accent)}

.layout{display:flex;flex:1;overflow:hidden}
.sidebar{width:380px;border-right:1px solid var(--line);overflow-y:auto;flex-shrink:0;background:var(--surface)}
.sidebar-header{padding:14px 16px;border-bottom:1px solid var(--line);font-family:var(--mono);font-size:.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.14em}
.issue-card{padding:14px 16px;border-bottom:1px solid var(--line);cursor:pointer;border-left:3px solid transparent;transition:background .15s}
.issue-card:hover{background:var(--sunk)}
.issue-card.active{background:var(--accent-wash);border-left-color:var(--accent)}
.issue-meta{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.badge{font-family:var(--mono);font-size:.625rem;font-weight:700;padding:2px 8px;border-radius:4px;text-transform:uppercase;letter-spacing:.06em;background:var(--sunk);border:1px solid var(--line)}
.issue-title{font-size:.8125rem;line-height:1.45;margin-bottom:4px}
.issue-sub{font-family:var(--mono);font-size:.6875rem;color:var(--muted)}
.score-pill{margin-left:auto;font-family:var(--mono);font-size:.6875rem;font-weight:700;padding:2px 8px;border-radius:4px;background:var(--sunk);font-variant-numeric:tabular-nums}
.source-badge{font-family:var(--mono);font-size:.5625rem;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.08em;background:var(--sunk);color:var(--muted)}
.source-slack{color:#C8386A}
.source-discord{color:#6C7BE8}

.main{flex:1;overflow-y:auto;padding:26px}
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--muted);gap:12px;text-align:center}
.empty svg{opacity:.35}
.section{margin-bottom:24px}
.section-title{font-family:var(--mono);font-size:.6875rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.14em;margin-bottom:10px}
.card{padding:18px}
.meta-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;margin-bottom:14px}
.meta-item label{font-family:var(--mono);font-size:.625rem;color:var(--muted);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:.1em}
.meta-item span{font-size:.875rem;font-weight:500}
p{font-size:.875rem;color:var(--muted);line-height:1.65}

.score-bar-wrap{display:flex;align-items:center;gap:12px}
.score-bar{flex:1;height:6px;background:var(--sunk);border-radius:3px;overflow:hidden}
.score-bar-fill{height:100%;border-radius:3px;transition:width .5s}
.score-num{font-family:var(--mono);font-size:1.5rem;font-weight:600;min-width:48px;text-align:right;font-variant-numeric:tabular-nums}
.breakdown{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
.breakdown-item{background:var(--sunk);border:1px solid var(--line);border-radius:6px;padding:5px 10px;font-family:var(--mono);font-size:.6875rem}
.breakdown-item label{color:var(--muted);margin-right:5px}

.diff{background:var(--surface);border:1px solid var(--line);border-radius:8px;overflow:auto;font-family:var(--mono);font-size:.75rem;line-height:1.7;max-height:400px}
.diff-line{padding:0 12px;white-space:pre}
.diff-line.add{background:var(--add-wash);color:var(--add)}
.diff-line.del{background:var(--del-wash);color:var(--del)}
.diff-line.hunk{background:var(--hunk-wash);color:var(--hunk)}

.resolve-btn{background:var(--accent);border:1px solid transparent;color:#fff;padding:10px 18px;border-radius:8px;cursor:pointer;font-size:.875rem;font-weight:600;font-family:var(--sans);margin-top:14px}
.resolve-btn:hover{background:var(--accent-text)}
.resolve-btn:disabled{background:var(--sunk);color:var(--muted);cursor:not-allowed;border-color:var(--line)}
.retriage-btn{background:var(--surface);border:1px solid var(--line);color:var(--muted);padding:4px 9px;border-radius:6px;cursor:pointer;font-size:.75rem;font-family:var(--mono)}
.retriage-btn:hover{border-color:var(--accent);color:var(--ink)}
.retriage-btn:disabled{opacity:.5;cursor:not-allowed}
.pr-link{display:inline-block;background:var(--accent-wash);border:1px solid var(--accent);color:var(--accent-text);padding:9px 16px;border-radius:8px;font-size:.875rem;font-weight:600;text-decoration:none;margin-top:14px}
.resolve-msg{font-size:.75rem;color:var(--muted);margin-top:8px;font-family:var(--mono);line-height:1.6}
.no-issues{color:var(--muted);font-size:.8125rem;padding:24px;text-align:center}

.loader{display:flex;gap:5px;align-items:center;padding:40px;justify-content:center}
.dot{width:7px;height:7px;border-radius:50%;background:var(--accent);animation:pulse 1s ease-in-out infinite}
.dot:nth-child(2){animation-delay:.2s}
.dot:nth-child(3){animation-delay:.4s}
@keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.dot{animation:none;opacity:.6}}

@media (max-width:820px){
  .layout{flex-direction:column}
  .sidebar{width:100%;max-height:42vh;border-right:none;border-bottom:1px solid var(--line)}
}
</style>`,
      body: `
  <header>
    <a class="brand" href="/">${BRAND_MARK}Sentifix</a>
    <span class="tagline">Triage</span>
    ${userBadge}
    <button class="refresh-btn" onclick="loadIssues()">Refresh</button>
  </header>
  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-header">Triaged issues</div>
      <div id="issue-list"><div class="loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>
    </div>
    <div class="main" id="main-panel">
      <div class="empty">
        <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <p>Select an issue to see the triage report</p>
      </div>
    </div>
  </div>

<script>
const API = '';
let issues = [];

function sev(s) {
  const colors = {
    critical:'var(--sev-critical)', high:'var(--sev-high)',
    medium:'var(--sev-medium)', low:'var(--sev-low)'
  };
  return colors[s?.toLowerCase()] || 'var(--muted)';
}

function latestRun(issue) {
  return (issue.runs || []).sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
}

function scoreColor(s) {
  if (s >= .8) return 'var(--sev-low)';
  if (s >= .6) return 'var(--sev-medium)';
  if (s >= .4) return 'var(--sev-high)';
  return 'var(--sev-critical)';
}

async function loadIssues() {
  const list = document.getElementById('issue-list');
  list.innerHTML = '<div class="loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div>';
  try {
    const r = await fetch(API + '/triage/issues');
    issues = await r.json();
    renderList();
  } catch(e) {
    list.innerHTML = '<div class="no-issues">Failed to load issues</div>';
  }
}

function renderList() {
  const list = document.getElementById('issue-list');
  if (!issues.length) { list.innerHTML = '<div class="no-issues">No issues triaged yet.<br>Open a GitHub issue to get started.</div>'; return; }
  list.innerHTML = issues.map((issue, i) => {
    const run = latestRun(issue);
    const cls = run?.classificationResult;
    const evalRes = run?.evalResults?.[0];
    const score = evalRes ? Math.round(evalRes.score * 100) : null;
    const severity = cls?.severity || 'unknown';
    return \`<div class="issue-card" onclick="selectIssue(\${i})" id="card-\${i}">
      <div class="issue-meta">
        <span class="badge" style="color:\${sev(severity)}">\${severity}</span>
        \${score !== null ? \`<span class="score-pill" style="color:\${scoreColor(evalRes.score)}">\${score}/100</span>\` : '<span class="score-pill">pending</span>'}
        <span class="source-badge source-\${issue.source || 'github'}">\${issue.source || 'github'}</span>
      </div>
      <div class="issue-title">\${issue.title}</div>
      <div class="issue-sub" style="display:flex;align-items:center;justify-content:space-between;gap:8px">
        <span>\${issue.repoFullName || ''} · #\${issue.githubIssueNumber} · \${run?.status || 'pending'}</span>
        <button class="retriage-btn" onclick="event.stopPropagation();retriageIssue('\${issue.id}',this)" title="Re-run triage with latest indexed code">Re-run</button>
      </div>
    </div>\`;
  }).join('');
}

function selectIssue(i) {
  document.querySelectorAll('.issue-card').forEach(c => c.classList.remove('active'));
  document.getElementById('card-' + i)?.classList.add('active');
  renderDetail(issues[i]);
}

function parseDiff(diff) {
  if (!diff || diff === '# insufficient-context') return '<div class="diff-line" style="color:var(--muted);padding:12px">No diff available — insufficient code context. Index the repository first.</div>';
  const clean = diff.replace(/^\`\`\`diff\\n?/, '').replace(/\\n?\`\`\`$/, '');
  return clean.split('\\n').map(line => {
    if (line.startsWith('+') && !line.startsWith('+++')) return \`<div class="diff-line add">\${esc(line)}</div>\`;
    if (line.startsWith('-') && !line.startsWith('---')) return \`<div class="diff-line del">\${esc(line)}</div>\`;
    if (line.startsWith('@@')) return \`<div class="diff-line hunk">\${esc(line)}</div>\`;
    return \`<div class="diff-line">\${esc(line)}</div>\`;
  }).join('');
}

function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function parseRationale(raw) {
  try { return JSON.parse(raw); } catch { return { rationale: raw, breakdown: null }; }
}

function renderDetail(issue) {
  const run = latestRun(issue);
  const panel = document.getElementById('main-panel');
  if (!run || run.status !== 'completed') {
    panel.innerHTML = \`<div class="empty"><p>Run status: <strong>\${run?.status || 'no runs'}</strong></p><p style="font-size:.75rem;margin-top:8px">Check app logs for progress</p></div>\`;
    return;
  }
  const cls = run.classificationResult || {};
  const diag = run.diagnosisResult || {};
  const evalRes = run.evalResults?.[0];
  const score = evalRes ? evalRes.score : 0;
  const rat = evalRes ? parseRationale(evalRes.rationale) : {};
  const bd = rat.breakdown || {};
  panel.innerHTML = \`
    <div class="section">
      <div class="section-title">Classification</div>
      <div class="card">
        <div class="meta-grid">
          <div class="meta-item"><label>Severity</label><span style="color:\${sev(cls.severity)}">\${cls.severity || '-'}</span></div>
          <div class="meta-item"><label>Category</label><span>\${cls.category || '-'}</span></div>
          <div class="meta-item"><label>Components</label><span>\${(cls.affectedComponents||[]).join(', ') || '-'}</span></div>
        </div>
        <p>\${cls.reasoning || ''}</p>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Diagnosis</div>
      <div class="card">
        <div class="meta-grid">
          <div class="meta-item" style="grid-column:1/-1"><label>Root cause</label><span>\${diag.rootCause || '-'}</span></div>
        </div>
        <p>\${diag.hypothesis || ''}</p>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Proposed fix</div>
      <div class="diff">\${parseDiff(run.proposedDiff)}</div>
      <div id="resolve-area-\${run.id}">
        \${run.proposedDiff && run.proposedDiff !== '# insufficient-context'
          ? \`<button class="resolve-btn" onclick="resolveRun('\${run.id}', this, '\${issue.repoFullName || ''}')">Approve — create branch and open PR</button>
             <div class="resolve-msg">Creates a branch, applies the diff, and opens a PR on GitHub</div>\`
          : '<div class="resolve-msg" style="margin-top:8px">No diff to apply — index the repo and re-run triage first</div>'
        }
      </div>
    </div>
    <div class="section">
      <div class="section-title">Eval score</div>
      <div class="card">
        <div class="score-bar-wrap" style="margin-bottom:12px">
          <div class="score-bar"><div class="score-bar-fill" style="width:\${score*100}%;background:\${scoreColor(score)}"></div></div>
          <div class="score-num" style="color:\${scoreColor(score)}">\${Math.round(score*100)}</div>
        </div>
        <p>\${rat.rationale || ''}</p>
        \${Object.keys(bd).length ? \`<div class="breakdown">\${Object.entries(bd).map(([k,v])=>\`<div class="breakdown-item"><label>\${k}</label>\${Math.round(v*100)}%</div>\`).join('')}</div>\` : ''}
      </div>
    </div>\`;
}

async function resolveRun(runId, btn, repoFullName) {
  btn.disabled = true;
  btn.textContent = 'Creating branch and PR…';
  try {
    const r = await fetch(API + '/triage/runs/' + runId + '/resolve', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ repoFullName }),
    });
    const data = await r.json();
    const area = document.getElementById('resolve-area-' + runId);
    if (r.ok) {
      area.innerHTML = \`
        <a class="pr-link" href="\${data.prUrl}" target="_blank" rel="noopener">View PR #\${data.prNumber} →</a>
        <div class="resolve-msg">Branch: <code>\${data.branchName}</code> · Files changed: \${data.filesChanged.join(', ')}
        \${data.filesSkipped.length ? '<br>Skipped (patch mismatch): ' + data.filesSkipped.join(', ') : ''}</div>\`;
    } else {
      area.innerHTML = \`<button class="resolve-btn" onclick="resolveRun('\${runId}', this)" style="background:var(--sev-critical)">Retry</button>
        <div class="resolve-msg" style="color:var(--del)">\${data.message || 'Failed to create PR'}</div>\`;
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = 'Approve — create branch and open PR';
  }
}

async function retriageIssue(issueId, btn) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const r = await fetch(API + '/triage/issues/' + issueId + '/retriage', { method: 'POST' });
    if (r.ok) {
      btn.textContent = 'Queued';
      btn.style.color = 'var(--add)';
      setTimeout(() => loadIssues(), 2000);
    } else {
      btn.textContent = 'Failed';
      btn.style.color = 'var(--del)';
      btn.disabled = false;
    }
  } catch {
    btn.textContent = 'Re-run';
    btn.disabled = false;
  }
}

loadIssues();
setInterval(loadIssues, 30000);
</script>`,
    });

    reply.type('text/html; charset=utf-8').send(html);
  }
}
