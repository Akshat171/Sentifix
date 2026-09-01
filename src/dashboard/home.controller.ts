import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SessionService } from '../auth/session.service';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { GITHUB_ICON, NAV_CSS, dashboardHeader, page } from '../ui/theme';

/**
 * The page a returning customer lands on.
 *
 * Previously /dashboard was the issue explorer, which shows "No issues triaged
 * yet" until a bug report arrives — so a customer who had just connected a repo
 * saw an empty screen and went back to the connect flow to check whether it had
 * worked. This is repo-first: it lists what is connected and what has happened
 * on each, so the answer to "is this set up and working?" is the first thing on
 * screen rather than something you have to infer.
 *
 * Someone with no installations at all is sent to /setup once, because for them
 * connecting really is the next step. Everyone else never sees it again.
 */
@Controller('dashboard')
export class HomeController {
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

      // Only a genuinely un-onboarded account goes to the connect screen.
      if (!sess.superuser) {
        const connected = sess.installationIds.length
          ? await this.repoMap.count({ where: { installationId: In(sess.installationIds) } })
          : 0;
        if (connected === 0) {
          reply.code(302).redirect('/setup?first=1');
          return;
        }
      }

      userBadge = `<span class="user">${sess.login} · <a href="/auth/logout">Log out</a></span>`;
    }

    reply.type('text/html; charset=utf-8').send(
      page({
        title: 'Sentifix — your repositories',
        description: 'Connected repositories, triage activity and fix quality at a glance.',
        head: `<style>
${NAV_CSS}
main{max-width:1000px;margin-inline:auto;padding:30px 24px 80px}
.head{display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;margin-bottom:22px}
.head h1{font-size:1.5rem;letter-spacing:-.02em;margin:0}
.head .sub{color:var(--muted);font-size:.875rem;margin-top:4px}
.head .act{margin-left:auto}
.totals{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:11px;overflow:hidden;margin-bottom:24px}
.totals div{background:var(--surface);padding:13px 15px}
.totals dt{font-family:var(--mono);font-size:.64rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.totals dd{margin:5px 0 0;font-family:var(--mono);font-size:1.4rem;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.repos{display:grid;gap:11px}
.repo{display:grid;grid-template-columns:1fr auto;gap:14px;align-items:center;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:16px 18px;text-decoration:none;color:inherit;transition:border-color .15s,transform .15s;cursor:pointer}
.repo:hover{border-color:var(--accent);transform:translateY(-1px)}
.repo.off{opacity:.62}
.repo.off:hover{border-color:var(--line);transform:none}
.repo .name a{color:inherit;text-decoration:none}
.repo .name a:hover{text-decoration:underline}
.conn{background:none;border:1px solid var(--line);color:var(--muted);font:inherit;font-size:.75rem;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}
.conn:hover{border-color:var(--del);color:var(--del);background:var(--del-wash)}
.conn.armed{border-color:var(--del);background:var(--del);color:#fff;font-weight:600}
.conn.on{color:var(--accent-text);border-color:var(--accent)}
.conn.on:hover{background:var(--accent-wash);color:var(--accent-text)}
.conn:disabled{opacity:.5;cursor:default}
.del{background:none;border:1px solid var(--line);color:var(--muted);font:inherit;font-size:.75rem;padding:5px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}
.del:hover{border-color:var(--del);color:var(--del);background:var(--del-wash)}
.confirm{display:flex;flex-direction:column;gap:8px;align-items:flex-end}
.confirm .warn{font-size:.75rem;color:var(--del);text-align:right;line-height:1.45;max-width:280px}
.confirm .row{display:flex;gap:6px}
.confirm input{background:var(--bg);border:1px solid var(--line);border-radius:7px;padding:6px 9px;font-family:var(--mono);font-size:.75rem;color:var(--ink);width:210px}
.confirm input:focus{outline:none;border-color:var(--del)}
.confirm .go{background:var(--del);border:1px solid var(--del);color:#fff;font:inherit;font-size:.75rem;font-weight:600;padding:6px 11px;border-radius:7px;cursor:pointer}
.confirm .go:disabled{opacity:.4;cursor:default}
.confirm .cancel{background:none;border:1px solid var(--line);color:var(--muted);font:inherit;font-size:.75rem;padding:6px 11px;border-radius:7px;cursor:pointer}
.repo .name{display:flex;align-items:center;gap:8px;font-family:var(--mono);font-size:.9375rem;font-weight:600;letter-spacing:-.01em}
.repo .name svg{opacity:.5;flex:none}
.repo .meta{display:flex;gap:14px;flex-wrap:wrap;margin-top:7px;font-size:.8125rem;color:var(--muted)}
.repo .meta b{color:var(--ink);font-family:var(--mono);font-variant-numeric:tabular-nums;font-weight:600}
.right{display:flex;align-items:center;gap:12px}
.score{font-family:var(--mono);font-size:1.15rem;font-weight:600;font-variant-numeric:tabular-nums;text-align:right;line-height:1.1}
.score small{display:block;font-size:.6rem;font-weight:400;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-top:2px}
.tag{font-family:var(--mono);font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 8px;border-radius:5px;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.tag::before{content:"";width:6px;height:6px;border-radius:50%;flex:none}
.tag.ready{color:var(--add);background:var(--add-wash)}
.tag.ready::before{background:var(--add)}
.tag.waiting{color:var(--sev-medium);background:var(--sunk)}
.tag.waiting::before{background:var(--sev-medium);border-radius:1px}
.tag.attention{color:var(--del);background:var(--del-wash)}
.tag.attention::before{background:var(--del);border-radius:1px}
.empty{text-align:center;padding:60px 20px;color:var(--muted)}
.empty h2{font-size:1.1rem;margin-bottom:8px;color:var(--ink)}
.skel{color:var(--muted);font-family:var(--mono);font-size:.8125rem;padding:30px 0}
.err{color:var(--del);font-size:.875rem}
</style>`,
        body: `
${dashboardHeader({ active: 'repos', userBadge })}
<main>
  <div class="head">
    <div>
      <h1>Your repositories</h1>
      <div class="sub" id="sub">Loading…</div>
    </div>
    <div class="act"><a class="btn btn-outline btn-sm" href="/setup">Connect another</a></div>
  </div>
  <div id="root"><p class="skel">Loading your repositories…</p></div>
</main>
<script>
(function () {
  var root = document.getElementById('root');
  var sub = document.getElementById('sub');

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function ago(iso) {
    if (!iso) return 'no activity yet';
    var m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return m + 'm ago';
    if (m < 1440) return Math.floor(m / 60) + 'h ago';
    return Math.floor(m / 1440) + 'd ago';
  }

  function scoreColor(s) {
    if (s === null) return 'var(--muted)';
    if (s >= 0.8) return 'var(--sev-low)';
    if (s >= 0.6) return 'var(--sev-medium)';
    return 'var(--sev-high)';
  }

  // The tag answers "do I need to do anything about this repo?" — not just status.
  function tag(r) {
    if (r.connected === false) return '<span class="tag waiting">Disconnected</span>';
    if (!r.indexed) return '<span class="tag waiting">Not indexed</span>';
    if (r.runs > 0 && r.failed > r.completed) return '<span class="tag attention">Failing</span>';
    if (r.issues === 0) return '<span class="tag ready">Ready · no issues yet</span>';
    return '<span class="tag ready">Active</span>';
  }

  function render(repos) {
    if (repos.length === 0) {
      sub.textContent = '';
      root.innerHTML =
        '<div class="empty"><h2>No repositories connected yet</h2>' +
        '<p>Install the GitHub App on a repository and Sentifix will start triaging its issues.</p>' +
        '<p style="margin-top:16px"><a class="btn btn-primary btn-sm" href="/setup">Connect a repository</a></p></div>';
      return;
    }

    var issues = repos.reduce(function (t, r) { return t + r.issues; }, 0);
    var runs = repos.reduce(function (t, r) { return t + r.runs; }, 0);
    var scored = repos.filter(function (r) { return r.avgScore !== null; });
    var avg = scored.length
      ? (scored.reduce(function (t, r) { return t + r.avgScore; }, 0) / scored.length).toFixed(2)
      : '—';

    sub.textContent =
      repos.length + ' connected · ' + issues + ' issue' + (issues === 1 ? '' : 's') + ' triaged';

    root.innerHTML =
      '<dl class="totals">' +
        '<div><dt>Repositories</dt><dd>' + repos.length + '</dd></div>' +
        '<div><dt>Issues triaged</dt><dd>' + issues + '</dd></div>' +
        '<div><dt>Triage runs</dt><dd>' + runs + '</dd></div>' +
        '<div><dt>Avg fix score</dt><dd>' + avg + '</dd></div>' +
      '</dl>' +
      '<div class="repos">' + repos.map(function (r) {
        var off = r.connected === false;
        var href = '/dashboard/issues?repo=' + encodeURIComponent(r.repoFullName);
        // A div rather than an anchor, because a button cannot legally live inside
        // one. The row stays clickable via the delegated handler below.
        return '<div class="repo' + (off ? ' off' : '') + '" data-href="' + href + '">' +
          '<div><div class="name">' + ${JSON.stringify(GITHUB_ICON)} +
            '<a href="' + href + '">' + esc(r.repoFullName) + '</a></div>' +
          '<div class="meta">' +
            '<span><b>' + r.issues + '</b> issues</span>' +
            '<span><b>' + r.completed + '</b> triaged</span>' +
            (r.failed > 0 ? '<span><b>' + r.failed + '</b> failed</span>' : '') +
            '<span>' + ago(r.lastActivity) + '</span>' +
          '</div></div>' +
          '<div class="right">' + tag(r) +
            '<div class="score" style="color:' + scoreColor(r.avgScore) + '">' +
              (r.avgScore === null ? '—' : r.avgScore.toFixed(2)) +
              '<small>score</small></div>' +
            '<button class="conn' + (off ? ' on' : '') + '" data-repo="' + esc(r.repoFullName) + '"' +
              ' data-connect="' + (off ? '1' : '0') + '">' + (off ? 'Reconnect' : 'Disconnect') + '</button>' +
            '<button class="del" data-repo="' + esc(r.repoFullName) + '"' +
              ' data-issues="' + r.issues + '" data-runs="' + r.runs + '" data-chunks="' + r.chunks + '">Delete</button>' +
          '</div></div>';
      }).join('') + '</div>';

    wireRows();
  }

  function wireRows() {
    Array.prototype.forEach.call(root.querySelectorAll('.repo'), function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('button') || e.target.closest('a')) return;
        window.location.href = card.dataset.href;
      });
    });

    Array.prototype.forEach.call(root.querySelectorAll('.conn'), function (btn) {
      btn.addEventListener('click', function () {
        var connect = btn.dataset.connect === '1';

        // Reconnecting is harmless, so it goes straight through. Disconnecting
        // stops triage on a live repo, so it asks once first.
        if (!connect && !btn.classList.contains('armed')) {
          btn.classList.add('armed');
          btn.textContent = 'Stop triaging?';
          setTimeout(function () {
            btn.classList.remove('armed');
            btn.textContent = 'Disconnect';
          }, 4000);
          return;
        }

        var parts = btn.dataset.repo.split('/');
        btn.disabled = true;
        btn.textContent = connect ? 'Reconnecting…' : 'Disconnecting…';

        fetch('/triage/repos/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]) + '/connection', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ connected: connect }),
        })
          .then(function (res) {
            if (!res.ok) throw new Error('Could not update ' + btn.dataset.repo);
            return load();
          })
          .catch(function (e) {
            btn.disabled = false;
            btn.textContent = connect ? 'Reconnect' : 'Disconnect';
            sub.textContent = e.message;
          });
      });
    });

    // Deleting a repo throws away every issue, run and indexed chunk for it, and
    // nothing brings them back. A two-step click is too easy to do by accident at
    // that cost, so this asks for the repo's name — the same bar GitHub sets for
    // deleting a repository, for the same reason.
    Array.prototype.forEach.call(root.querySelectorAll('.del'), function (btn) {
      btn.addEventListener('click', function () {
        var repo = btn.dataset.repo;
        var right = btn.parentNode;
        var restore = right.innerHTML;

        var counts = [];
        if (+btn.dataset.issues) counts.push(btn.dataset.issues + ' issue' + (+btn.dataset.issues === 1 ? '' : 's'));
        if (+btn.dataset.runs) counts.push(btn.dataset.runs + ' run' + (+btn.dataset.runs === 1 ? '' : 's'));
        if (+btn.dataset.chunks) counts.push(btn.dataset.chunks + ' indexed chunk' + (+btn.dataset.chunks === 1 ? '' : 's'));

        right.innerHTML =
          '<div class="confirm">' +
            '<div class="warn">Permanently deletes ' +
              (counts.length ? counts.join(', ') : 'this repository\\'s history') +
              '. Your code and GitHub comments are untouched.</div>' +
            '<div class="row">' +
              '<input type="text" placeholder="' + esc(repo) + '" aria-label="Type the repository name to confirm">' +
              '<button class="go" disabled>Delete</button>' +
              '<button class="cancel">Cancel</button>' +
            '</div>' +
          '</div>';

        var input = right.querySelector('input');
        var go = right.querySelector('.go');
        var cancel = right.querySelector('.cancel');
        input.focus();

        input.addEventListener('input', function () {
          go.disabled = input.value.trim() !== repo;
        });
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' && !go.disabled) go.click();
          if (e.key === 'Escape') cancel.click();
        });
        cancel.addEventListener('click', function () {
          right.innerHTML = restore;
          wireRows();
        });

        go.addEventListener('click', function () {
          var parts = repo.split('/');
          go.disabled = true;
          go.textContent = 'Deleting…';

          fetch('/triage/repos/' + encodeURIComponent(parts[0]) + '/' + encodeURIComponent(parts[1]), {
            method: 'DELETE',
          })
            .then(function (res) {
              if (!res.ok) throw new Error('Could not delete ' + repo);
              return res.json();
            })
            .then(function (d) {
              sub.textContent =
                'Deleted ' + repo + ' — ' + d.issues + ' issue(s), ' + d.runs + ' run(s), ' +
                d.chunks + ' chunk(s) removed';
              return load();
            })
            .catch(function (e) {
              right.innerHTML = restore;
              wireRows();
              sub.textContent = e.message;
            });
        });
      });
    });
  }

  function load() {
    return fetch('/triage/overview')
      .then(function (res) {
        if (res.status === 401) { window.location.href = '/auth/login'; return null; }
        if (!res.ok) throw new Error('Could not load your repositories');
        return res.json();
      })
      .then(function (d) { if (d) render(d); })
      .catch(function (e) {
        sub.textContent = '';
        root.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
      });
  }

  load();
})();
</script>`,
      }),
    );
  }
}
