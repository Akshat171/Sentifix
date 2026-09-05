import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SessionService } from '../auth/session.service';
import { DASHBOARD_SHELL_END, NAV_CSS, SHELL_JS, dashboardShell, page } from '../ui/theme';

/**
 * Self-serve API keys.
 *
 * This page is the whole trial funnel: a new customer signs in, sees how long
 * they have, and leaves with a working credential — no email, no approval step,
 * no one to ask. So it has to answer three things without being asked: what can
 * I use right now, how do I call it, and what happens when the trial ends.
 *
 * The secret is rendered exactly once, at creation, and never fetched again —
 * the server only keeps its hash.
 */
@Controller('dashboard/keys')
export class KeysController {
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

    reply.type('text/html; charset=utf-8').send(
      page({
        title: 'Sentifix — API keys',
        description: 'Create and revoke the keys that authenticate your calls to the Sentifix API.',
        fullHeight: true,
        head: `<style>
${NAV_CSS}
main{padding:26px 24px 70px}
.inner{max-width:860px;margin-inline:auto}
.head{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.head h1{font-size:1.5rem;letter-spacing:-.02em;margin:0}
.head .sub{color:var(--muted);font-size:.875rem;margin-top:4px}
.head .act{margin-left:auto}

.status{border:1px solid var(--line);border-left-width:3px;border-radius:11px;background:var(--surface);padding:15px 18px;margin-bottom:24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
.status.trial{border-left-color:var(--sev-medium)}
.status.paid{border-left-color:var(--add)}
.status.blocked{border-left-color:var(--del)}
.status .what{font-weight:600;font-size:.9375rem}
.status .detail{color:var(--muted);font-size:.8125rem;margin-top:3px}
.status .cta{margin-left:auto}

.panel{background:var(--surface);border:1px solid var(--line);border-radius:11px;overflow:hidden}
.panel h2{font-size:.9375rem;margin:0;padding:14px 18px;border-bottom:1px solid var(--line)}
table{width:100%;border-collapse:collapse;font-size:.875rem}
th{text-align:left;font-family:var(--mono);font-size:.64rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:500;padding:10px 18px;border-bottom:1px solid var(--line)}
td{padding:13px 18px;border-bottom:1px solid var(--line)}
tr:last-child td{border-bottom:0}
td.key{font-family:var(--mono);font-size:.8125rem}
td.dim{color:var(--muted);font-size:.8125rem;white-space:nowrap}
td.act{text-align:right;white-space:nowrap}
.link-danger{background:none;border:0;color:var(--del);font-size:.8125rem;cursor:pointer;padding:4px 8px;border-radius:6px;font-family:inherit}
.link-danger:hover{background:var(--del-wash)}
.link-danger.armed{background:var(--del);color:#fff;font-weight:600}

.reveal{border:1px solid var(--add);background:var(--add-wash);border-radius:11px;padding:16px 18px;margin-bottom:22px}
.reveal h3{margin:0 0 4px;font-size:.9375rem}
.reveal p{margin:0 0 12px;font-size:.8125rem;color:var(--muted)}
.secret{display:flex;gap:8px;align-items:stretch}
.secret code{flex:1;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;font-family:var(--mono);font-size:.8125rem;word-break:break-all;user-select:all}

.namer{display:flex;gap:8px;margin-bottom:22px}
.namer input{flex:1;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:9px 12px;font:inherit;font-size:.875rem;color:var(--ink)}
.namer input:focus{outline:none;border-color:var(--accent)}

.usage{margin-top:26px}
.usage h2{font-size:.9375rem;margin:0 0 10px}
pre{background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:15px 18px;overflow-x:auto;font-family:var(--mono);font-size:.8125rem;line-height:1.6;margin:0}
pre .c{color:var(--muted)}
.empty{padding:34px 18px;text-align:center;color:var(--muted);font-size:.875rem}
.skel{color:var(--muted);font-family:var(--mono);font-size:.8125rem;padding:30px 0}
.err{color:var(--del);font-size:.875rem}
</style>`,
        body: `
${dashboardShell({ active: 'keys', crumb: 'API keys', userBadge })}
<main>
  <div class="inner">
  <div class="head">
    <div>
      <h1>API keys</h1>
      <div class="sub">Authenticate your calls to the Sentifix API.</div>
    </div>
  </div>

  <div id="status"></div>
  <div id="reveal"></div>

  <div class="namer">
    <input id="name" type="text" placeholder="Name this key — e.g. CI, staging, laptop" maxlength="60">
    <button class="btn btn-primary btn-sm" id="create">Create key</button>
  </div>

  <div id="root"><p class="skel">Loading your keys…</p></div>

  <div class="usage">
    <h2>Using your key</h2>
    <pre><span class="c"># every endpoint accepts either header</span>
curl <span id="origin">https://sentifix.dev</span>/v1/me \\
  -H "x-api-key: <span class="c">sfx_live_…</span>"

<span class="c"># list the repositories this key can see</span>
curl <span id="origin2">https://sentifix.dev</span>/v1/repos -H "x-api-key: <span class="c">sfx_live_…</span>"

<span class="c"># re-run triage on one issue</span>
curl -X POST <span id="origin3">https://sentifix.dev</span>/v1/issues/<span class="c">&lt;issueId&gt;</span>/retriage \\
  -H "x-api-key: <span class="c">sfx_live_…</span>"</pre>
  </div>
  </div>
</main>
${DASHBOARD_SHELL_END}
<script>${SHELL_JS}</script>
<script>
(function () {
  var root = document.getElementById('root');
  var statusEl = document.getElementById('status');
  var revealEl = document.getElementById('reveal');
  var nameEl = document.getElementById('name');
  var createBtn = document.getElementById('create');

  ['origin', 'origin2', 'origin3'].forEach(function (id) {
    document.getElementById(id).textContent = window.location.origin;
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function when(iso) {
    if (!iso) return 'never used';
    var d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (d === 0) return 'today';
    if (d === 1) return 'yesterday';
    return d + 'd ago';
  }

  function date(iso) {
    return iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  }

  // Says what the customer can do right now and what to do about it — the same
  // three states the API itself enforces, so the page never disagrees with a 403.
  function renderStatus(e) {
    if (!e) { statusEl.innerHTML = ''; return; }
    var kind = e.reason === 'trial' ? 'trial' : e.reason === 'paid' ? 'paid' : 'blocked';
    var what, detail, cta = '';

    if (e.reason === 'trial') {
      var d = e.trialDaysLeft;
      what = 'Free trial · ' + d + ' day' + (d === 1 ? '' : 's') + ' left';
      detail = 'Ends ' + date(e.trialEndsAt) + '. Add credits any time to keep going after that.';
      cta = '<a class="btn btn-outline btn-sm" href="/dashboard/usage">Add credits</a>';
    } else if (e.reason === 'paid') {
      what = e.availableCredits + ' credits available';
      detail = 'Your keys work as long as you have credits.';
      cta = '<a class="btn btn-outline btn-sm" href="/dashboard/usage">Top up</a>';
    } else if (e.reason === 'trial_expired') {
      what = 'Your free trial has ended';
      detail = 'Your keys are still here — add credits and they start working again immediately.';
      cta = '<a class="btn btn-primary btn-sm" href="/dashboard/usage">Add credits</a>';
    } else {
      what = 'No credits remaining';
      detail = 'Calls are refused until you top up.';
      cta = '<a class="btn btn-primary btn-sm" href="/dashboard/usage">Top up</a>';
    }

    statusEl.innerHTML =
      '<div class="status ' + kind + '"><div><div class="what">' + esc(what) + '</div>' +
      '<div class="detail">' + esc(detail) + '</div></div>' +
      (cta ? '<div class="cta">' + cta + '</div>' : '') + '</div>';
  }

  function renderKeys(keys) {
    if (keys.length === 0) {
      root.innerHTML = '<div class="panel"><div class="empty">No keys yet. Create one above to start calling the API.</div></div>';
      return;
    }

    root.innerHTML =
      '<div class="panel"><h2>' + keys.length + ' active key' + (keys.length === 1 ? '' : 's') + '</h2>' +
      '<table><thead><tr><th>Name</th><th>Key</th><th>Created</th><th>Last used</th><th></th></tr></thead><tbody>' +
      keys.map(function (k) {
        return '<tr><td>' + esc(k.name) + '</td>' +
          '<td class="key">' + esc(k.prefix) + '…</td>' +
          '<td class="dim">' + date(k.createdAt) + '</td>' +
          '<td class="dim">' + when(k.lastUsedAt) + '</td>' +
          '<td class="act"><button class="link-danger" data-id="' + esc(k.id) + '">Revoke</button></td></tr>';
      }).join('') + '</tbody></table></div>';

    // Two-step rather than a confirm() dialog: revoking is instant and permanent,
    // but a modal for it is heavier than the action deserves.
    Array.prototype.forEach.call(root.querySelectorAll('.link-danger'), function (btn) {
      btn.addEventListener('click', function () {
        if (!btn.classList.contains('armed')) {
          btn.classList.add('armed');
          btn.textContent = 'Confirm revoke';
          setTimeout(function () {
            btn.classList.remove('armed');
            btn.textContent = 'Revoke';
          }, 4000);
          return;
        }
        btn.disabled = true;
        btn.textContent = 'Revoking…';
        fetch('/billing/me/keys/' + encodeURIComponent(btn.dataset.id), { method: 'DELETE' })
          .then(function (r) { if (!r.ok) throw new Error('Could not revoke that key'); return load(); })
          .catch(fail);
      });
    });
  }

  function fail(e) {
    root.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
  }

  function load() {
    return fetch('/billing/me/keys')
      .then(function (r) {
        if (r.status === 401) { window.location.href = '/auth/login'; return null; }
        if (!r.ok) return r.json().then(function (b) { throw new Error(b.message || 'Could not load your keys'); });
        return r.json();
      })
      .then(function (d) { if (d) { renderStatus(d.entitlement); renderKeys(d.keys); } })
      .catch(fail);
  }

  createBtn.addEventListener('click', function () {
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';

    fetch('/billing/me/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: nameEl.value.trim() || 'API key' }),
    })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (b) { throw new Error(b.message || 'Could not create a key'); });
        return r.json();
      })
      .then(function (k) {
        nameEl.value = '';
        revealEl.innerHTML =
          '<div class="reveal"><h3>Your new key — copy it now</h3>' +
          '<p>' + esc(k.warning) + '</p>' +
          '<div class="secret"><code id="secret">' + esc(k.key) + '</code>' +
          '<button class="btn btn-primary btn-sm" id="copy">Copy</button></div></div>';

        document.getElementById('copy').addEventListener('click', function () {
          var btn = this;
          navigator.clipboard.writeText(k.key).then(function () {
            btn.textContent = 'Copied';
            setTimeout(function () { btn.textContent = 'Copy'; }, 2000);
          });
        });

        return load();
      })
      .catch(function (e) {
        revealEl.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
      })
      .finally(function () {
        createBtn.disabled = false;
        createBtn.textContent = 'Create key';
      });
  });

  nameEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') createBtn.click();
  });

  load();
})();
</script>`,
      }),
    );
  }
}
