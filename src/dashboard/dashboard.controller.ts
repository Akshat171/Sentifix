import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SessionService } from '../auth/session.service';

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
      userBadge = `<span style="margin-left:auto;font-size:12px;color:#8b949e">${sess.login} · <a href="/auth/logout" style="color:#58a6ff">Logout</a></span>`;
    }
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sentifix Dashboard</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;height:100vh;display:flex;flex-direction:column}
    header{background:#161b22;border-bottom:1px solid #30363d;padding:14px 24px;display:flex;align-items:center;gap:12px;flex-shrink:0}
    header h1{font-size:18px;font-weight:600;color:#f0f6fc}
    header span{font-size:12px;color:#8b949e;background:#21262d;padding:2px 8px;border-radius:12px}
    .layout{display:flex;flex:1;overflow:hidden}
    .sidebar{width:380px;border-right:1px solid #30363d;overflow-y:auto;flex-shrink:0}
    .sidebar-header{padding:16px;border-bottom:1px solid #30363d;font-size:12px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.5px}
    .issue-card{padding:14px 16px;border-bottom:1px solid #21262d;cursor:pointer;transition:background .15s}
    .issue-card:hover{background:#161b22}
    .issue-card.active{background:#161b22;border-left:3px solid #58a6ff}
    .issue-meta{display:flex;align-items:center;gap:8px;margin-bottom:6px}
    .badge{font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;text-transform:uppercase}
    .issue-title{font-size:13px;color:#c9d1d9;line-height:1.4;margin-bottom:4px}
    .issue-sub{font-size:11px;color:#6e7681}
    .score-pill{margin-left:auto;font-size:11px;font-weight:700;padding:2px 8px;border-radius:12px;background:#21262d}
    .main{flex:1;overflow-y:auto;padding:24px}
    .empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#6e7681;gap:12px}
    .empty svg{opacity:.3}
    .section{margin-bottom:24px}
    .section-title{font-size:12px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:16px}
    .meta-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px}
    .meta-item label{font-size:11px;color:#6e7681;display:block;margin-bottom:4px}
    .meta-item span{font-size:13px;color:#e6edf3;font-weight:500}
    .score-bar-wrap{display:flex;align-items:center;gap:10px}
    .score-bar{flex:1;height:6px;background:#21262d;border-radius:3px;overflow:hidden}
    .score-bar-fill{height:100%;border-radius:3px;background:linear-gradient(90deg,#f97316,#22c55e);transition:width .5s}
    .score-num{font-size:20px;font-weight:700;min-width:48px;text-align:right}
    p{font-size:13px;color:#c9d1d9;line-height:1.6}
    .diff{background:#0d1117;border:1px solid #30363d;border-radius:6px;overflow:auto;font-family:'SFMono-Regular',Consolas,monospace;font-size:12px;line-height:1.6;max-height:400px}
    .diff-line{padding:0 12px;white-space:pre}
    .diff-line.add{background:rgba(46,160,67,.15);color:#3fb950}
    .diff-line.del{background:rgba(248,81,73,.15);color:#f85149}
    .diff-line.hunk{background:rgba(88,166,255,.1);color:#58a6ff}
    .breakdown{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
    .breakdown-item{background:#21262d;border-radius:6px;padding:6px 10px;font-size:12px}
    .breakdown-item label{color:#6e7681;margin-right:4px}
    .resolve-btn{background:#238636;border:1px solid #2ea043;color:#fff;padding:8px 18px;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600;margin-top:16px}
    .resolve-btn:hover{background:#2ea043}
    .resolve-btn:disabled{background:#21262d;color:#6e7681;cursor:not-allowed;border-color:#30363d}
    .retriage-btn{background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:6px 14px;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600}
    .retriage-btn:hover{background:#30363d}
    .retriage-btn:disabled{opacity:.5;cursor:not-allowed}
    .pr-link{display:inline-block;background:#1f6feb22;border:1px solid #1f6feb;color:#58a6ff;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;margin-top:16px}
    .pr-link:hover{background:#1f6feb44}
    .resolve-msg{font-size:12px;color:#6e7681;margin-top:8px}
    .loader{display:flex;gap:4px;align-items:center;padding:40px;justify-content:center}
    .dot{width:8px;height:8px;border-radius:50%;background:#58a6ff;animation:pulse 1s ease-in-out infinite}
    .dot:nth-child(2){animation-delay:.2s}
    .dot:nth-child(3){animation-delay:.4s}
    @keyframes pulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
    .refresh-btn{background:#21262d;border:1px solid #30363d;color:#c9d1d9;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;margin-left:auto}
    .refresh-btn:hover{background:#30363d}
    .no-issues{color:#6e7681;font-size:13px;padding:24px;text-align:center}
    .source-badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.5px}
    .source-github{background:#21262d;color:#8b949e}
    .source-slack{background:#4A154B22;color:#E01E5A}
    .source-discord{background:#5865F222;color:#5865F2}
  </style>
</head>
<body>
  <header>
    <svg width="20" height="20" viewBox="0 0 16 16" fill="#58a6ff"><path d="M8 0a8 8 0 100 16A8 8 0 008 0zm3.5 7.5h-3v-3a.5.5 0 00-1 0v3h-3a.5.5 0 000 1h3v3a.5.5 0 001 0v-3h3a.5.5 0 000-1z"/></svg>
    <h1>Sentifix</h1>
    <span>AI Bug Triage</span>
    ${userBadge}
    <button class="refresh-btn" onclick="loadIssues()">↻ Refresh</button>
  </header>
  <div class="layout">
    <div class="sidebar">
      <div class="sidebar-header">Triaged Issues</div>
      <div id="issue-list"><div class="loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>
    </div>
    <div class="main" id="main-panel">
      <div class="empty">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
        <p>Select an issue to see the triage report</p>
      </div>
    </div>
  </div>

<script>
const API = '';
let issues = [];

function sev(s) {
  const colors = {critical:'#ef4444',high:'#f97316',medium:'#eab308',low:'#22c55e'};
  return colors[s?.toLowerCase()] || '#8b949e';
}

function latestRun(issue) {
  return (issue.runs || []).sort((a,b) => new Date(b.startedAt) - new Date(a.startedAt))[0];
}

function scoreColor(s) {
  if (s >= .8) return '#22c55e';
  if (s >= .6) return '#eab308';
  if (s >= .4) return '#f97316';
  return '#ef4444';
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
        <span class="badge" style="background:\${sev(severity)}22;color:\${sev(severity)}">\${severity}</span>
        \${score !== null ? \`<span class="score-pill" style="color:\${scoreColor(evalRes.score)}">\${score}/100</span>\` : '<span class="score-pill" style="color:#6e7681">pending</span>'}
        <span class="source-badge source-\${issue.source || 'github'}">\${issue.source || 'github'}</span>
      </div>
      <div class="issue-title">\${issue.title}</div>
      <div class="issue-sub" style="display:flex;align-items:center;justify-content:space-between">
        <span>\${issue.repoFullName || ''} · #\${issue.githubIssueNumber} · \${run?.status || 'pending'}</span>
        <button class="retriage-btn" onclick="event.stopPropagation();retriageIssue('\${issue.id}',this)" title="Re-run triage with latest indexed code">↺</button>
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
  if (!diff || diff === '# insufficient-context') return '<div class="diff-line" style="color:#6e7681;padding:12px">No diff available — insufficient code context. Index the repository first.</div>';
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
    panel.innerHTML = \`<div class="empty"><p>Run status: <strong>\${run?.status || 'no runs'}</strong></p><p style="color:#6e7681;font-size:12px;margin-top:8px">Check app logs for progress</p></div>\`;
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
          <div class="meta-item" style="grid-column:1/-1"><label>Root Cause</label><span>\${diag.rootCause || '-'}</span></div>
        </div>
        <p>\${diag.hypothesis || ''}</p>
      </div>
    </div>
    <div class="section">
      <div class="section-title">Proposed Fix</div>
      <div class="diff">\${parseDiff(run.proposedDiff)}</div>
      <div id="resolve-area-\${run.id}">
        \${run.proposedDiff && run.proposedDiff !== '# insufficient-context'
          ? \`<button class="resolve-btn" onclick="resolveRun('\${run.id}', this, '\${issue.repoFullName || ''}')">🔀 Resolve — Create Branch &amp; Open PR</button>
             <div class="resolve-msg">Creates a branch, applies the diff, and opens a PR on GitHub</div>\`
          : '<div class="resolve-msg" style="margin-top:8px">No diff to apply — index the repo and re-triage first</div>'
        }
      </div>
    </div>
    <div class="section">
      <div class="section-title">Eval Score</div>
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
  btn.textContent = '⏳ Creating branch & PR...';
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
        <a class="pr-link" href="\${data.prUrl}" target="_blank">🔀 View PR #\${data.prNumber} →</a>
        <div class="resolve-msg">Branch: <code>\${data.branchName}</code> · Files changed: \${data.filesChanged.join(', ')}
        \${data.filesSkipped.length ? '<br>Skipped (patch mismatch): ' + data.filesSkipped.join(', ') : ''}</div>\`;
    } else {
      area.innerHTML = \`<button class="resolve-btn" onclick="resolveRun('\${runId}', this)" style="background:#b91c1c;border-color:#ef4444">Retry</button>
        <div class="resolve-msg" style="color:#f85149">\${data.message || 'Failed to create PR'}</div>\`;
    }
  } catch(e) {
    btn.disabled = false;
    btn.textContent = '🔀 Resolve — Create Branch & Open PR';
  }
}

async function retriageIssue(issueId, btn) {
  btn.disabled = true;
  btn.textContent = '⏳';
  try {
    const r = await fetch(API + '/triage/issues/' + issueId + '/retriage', { method: 'POST' });
    if (r.ok) {
      btn.textContent = '✓';
      btn.style.color = '#2ea043';
      setTimeout(() => loadIssues(), 2000);
    } else {
      btn.textContent = '✗';
      btn.style.color = '#f85149';
      btn.disabled = false;
    }
  } catch {
    btn.textContent = '↺';
    btn.disabled = false;
  }
}

loadIssues();
setInterval(loadIssues, 30000);
</script>
</body>
</html>`;

    reply.type('text/html; charset=utf-8').send(html);
  }
}
