import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { SessionService } from '../auth/session.service';
import { NAV_CSS, dashboardHeader, page } from '../ui/theme';

/**
 * The customer's usage and plan screen.
 *
 * Everything is expressed in runs rather than credits. Cost varies about 25x
 * between tiers, so "2,000 credits" tells a customer nothing about how long they
 * have left, while "390 triages" is a number they can plan around. The tier
 * selector shows the consequence of each option before it is chosen, which is
 * what stops someone upgrading and burning their balance on four issues.
 */
@Controller('dashboard/usage')
export class UsageController {
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
        title: 'Sentifix — usage & plan',
        description: 'Credit balance, triages remaining, and plan selection.',
        head: `<style>
${NAV_CSS}
main{max-width:840px;margin-inline:auto;padding:34px 24px 80px}
.eyebrow{font-family:var(--mono);font-size:.6875rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-text);margin-bottom:10px}
.hero-num{font-family:var(--mono);font-size:3.1rem;font-weight:600;letter-spacing:-.04em;line-height:1;font-variant-numeric:tabular-nums}
.hero-sub{color:var(--muted);font-size:.95rem;margin-top:8px}
.hero-foot{font-family:var(--mono);font-size:.75rem;color:var(--muted);margin-top:5px}
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-top:22px}
.tier{border:1px solid var(--line);border-radius:10px;padding:14px;background:var(--surface);cursor:pointer;text-align:left;font:inherit;color:inherit;transition:border-color .15s}
.tier:hover{border-color:var(--accent)}
.tier[aria-pressed="true"]{border-color:var(--accent);background:var(--accent-wash)}
.tier .name{font-family:var(--mono);font-size:.8125rem;font-weight:600}
.tier .runs{font-family:var(--mono);font-size:1.4rem;font-weight:600;margin-top:7px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.tier .runs small{font-size:.6875rem;font-weight:400;color:var(--muted)}
.tier .delta{font-family:var(--mono);font-size:.6875rem;margin-top:5px}
.up{color:var(--add)} .down{color:var(--del)} .flat{color:var(--muted)}
.confirm{margin-top:16px;border:1px solid var(--accent);background:var(--accent-wash);border-radius:10px;padding:16px;display:none}
.confirm.show{display:block}
.confirm p{margin:0 0 12px;font-size:.9rem}
.confirm .acts{display:flex;gap:9px}
.muted{color:var(--muted)}
.err{color:var(--del);font-size:.875rem;margin-top:12px}
.skel{color:var(--muted);font-family:var(--mono);font-size:.8125rem}
</style>`,
        body: `
${dashboardHeader({ active: 'usage', userBadge })}
<main>
  <p class="eyebrow">Usage &amp; plan</p>
  <div id="root"><p class="skel">Loading your plan…</p></div>
</main>
<script>
(function () {
  var root = document.getElementById('root');
  var pending = null;

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function deltaMarkup(o) {
    if (o.current) return '<div class="delta flat">current plan</div>';
    if (o.deltaRuns === 0) return '<div class="delta flat">same runway</div>';
    var cls = o.deltaRuns > 0 ? 'up' : 'down';
    var sign = o.deltaRuns > 0 ? '+' : '';
    return '<div class="delta ' + cls + '">' + sign + o.deltaRuns + ' vs now</div>';
  }

  function render(d) {
    var current = d.options.filter(function (o) { return o.current; })[0];
    var runway = d.daysRemaining === null
      ? 'not enough history to project yet'
      : 'about ' + d.daysRemaining + ' days at your recent pace';

    root.innerHTML =
      '<div class="hero-num">' + d.runsRemaining + '</div>' +
      '<div class="hero-sub">triages remaining on <strong>' +
        esc(current ? current.label : d.currentModelKey) + '</strong>' +
        (d.usingDefault ? ' <span class="muted">(default plan)</span>' : '') + '</div>' +
      '<div class="hero-foot">' + esc(d.availableCredits) + ' credits · ' + runway + '</div>' +
      '<div class="tiers">' + d.options.map(function (o) {
        return '<button class="tier" type="button" data-key="' + esc(o.key) + '" ' +
          'aria-pressed="' + (o.current ? 'true' : 'false') + '">' +
          '<div class="name">' + esc(o.label) + '</div>' +
          '<div class="runs">' + o.runsRemaining + ' <small>runs</small></div>' +
          deltaMarkup(o) +
          '<div class="delta muted">' + o.creditsPerRun + ' cr / run</div>' +
          '</button>';
      }).join('') + '</div>' +
      '<div class="confirm" id="confirm"><p id="confirm-text"></p>' +
        '<div class="acts">' +
          '<button class="btn btn-primary btn-sm" id="go">Switch plan</button>' +
          '<button class="btn btn-outline btn-sm" id="no">Cancel</button>' +
        '</div></div>';

    Array.prototype.forEach.call(root.querySelectorAll('.tier'), function (b) {
      b.addEventListener('click', function () { ask(d, b.dataset.key); });
    });
    document.getElementById('no').addEventListener('click', hide);
    document.getElementById('go').addEventListener('click', commit);
  }

  function ask(d, key) {
    var o = d.options.filter(function (x) { return x.key === key; })[0];
    if (!o || o.current) return hide();
    pending = key;

    // State the consequence in runs, not credits -- this is the whole point of
    // the screen, and it is the last moment the customer can change their mind.
    var msg = o.deltaRuns < 0
      ? 'Switching to <strong>' + esc(o.label) + '</strong> costs ' + o.creditsPerRun +
        ' credits per triage, so your balance drops from <strong>' + d.runsRemaining +
        '</strong> to <strong>' + o.runsRemaining + '</strong> remaining triages.'
      : 'Switching to <strong>' + esc(o.label) + '</strong> costs ' + o.creditsPerRun +
        ' credits per triage, giving you <strong>' + o.runsRemaining +
        '</strong> remaining triages instead of ' + d.runsRemaining + '.';

    document.getElementById('confirm-text').innerHTML = msg;
    document.getElementById('confirm').classList.add('show');
  }

  function hide() {
    pending = null;
    var c = document.getElementById('confirm');
    if (c) c.classList.remove('show');
  }

  function commit() {
    if (!pending) return;
    var go = document.getElementById('go');
    go.disabled = true;
    go.textContent = 'Switching…';
    fetch('/billing/me/tier', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelKey: pending }),
    })
      .then(function (r) { if (!r.ok) throw new Error('Could not change plan'); return load(); })
      .catch(function (e) {
        go.disabled = false;
        go.textContent = 'Switch plan';
        root.insertAdjacentHTML('beforeend', '<p class="err">' + esc(e.message) + '</p>');
      });
  }

  function load() {
    return fetch('/billing/me')
      .then(function (r) {
        if (r.status === 401) { window.location.href = '/auth/login'; return null; }
        if (!r.ok) throw new Error('Could not load your plan');
        return r.json();
      })
      .then(function (d) { if (d) { hide(); render(d); } })
      .catch(function (e) {
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
