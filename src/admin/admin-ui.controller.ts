import { Controller, Get, Res } from '@nestjs/common';
import type { HttpReply } from '../auth/http.types';
import { BRAND_MARK, page } from '../ui/theme';

/**
 * The operator console.
 *
 * Deliberately NOT behind AdminGuard: a browser navigation cannot send an
 * x-api-key header, and weakening the guard to accept a cookie would undo its
 * fail-closed property. Instead the shell is public but empty — it contains no
 * data and no secret, and every request it makes carries the key the operator
 * pastes in, held in sessionStorage for the tab's lifetime only.
 */
@Controller('admin')
export class AdminUiController {
  @Get()
  serve(@Res() reply: HttpReply): void {
    reply.type('text/html; charset=utf-8').send(
      page({
        title: 'Sentifix — operator console',
        head: `<style>
header{background:var(--surface);border-bottom:1px solid var(--line);padding:12px 22px;display:flex;align-items:center;gap:12px}
header .brand{display:flex;align-items:center;gap:9px;font-family:var(--mono);font-size:.875rem;font-weight:600}
header .tag{font-family:var(--mono);font-size:.6875rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
main{max-width:1060px;margin-inline:auto;padding:30px 24px 80px}
.eyebrow{font-family:var(--mono);font-size:.6875rem;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--accent-text);margin-bottom:10px}
.gate{max-width:420px;margin:70px auto;text-align:left}
.gate input{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-family:var(--mono);font-size:.875rem;margin:12px 0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:26px}
.stat{background:var(--surface);padding:14px 16px}
.stat dt{font-family:var(--mono);font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.stat dd{margin:6px 0 0;font-family:var(--mono);font-size:1.5rem;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.rows{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:var(--surface)}
.row{display:grid;grid-template-columns:auto 1fr auto auto;gap:14px;align-items:center;padding:13px 15px;border-bottom:1px solid var(--line)}
.row:last-child{border-bottom:none}
.who{font-family:var(--mono);font-size:.8125rem;font-weight:600}
.why{color:var(--muted);font-size:.8125rem;margin-top:2px}
.num{font-family:var(--mono);font-size:.8125rem;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
.num small{display:block;font-size:.625rem;color:var(--muted);letter-spacing:.06em;text-transform:uppercase}
.chip{font-family:var(--mono);font-size:.625rem;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:5px;white-space:nowrap;display:inline-flex;align-items:center;gap:5px}
.chip::before{content:"";width:6px;height:6px;flex:none;border-radius:50%}
.chip.up{color:var(--del);background:var(--del-wash)}
.chip.up::before{background:var(--del);border-radius:1px}
.chip.down{color:var(--sev-medium);background:var(--sunk)}
.chip.down::before{background:var(--sev-medium)}
.chip.ok{color:var(--add);background:var(--add-wash)}
.chip.ok::before{background:var(--add)}
select{font-family:var(--mono);font-size:.75rem;padding:5px 8px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--ink)}
.err{color:var(--del);font-size:.875rem;margin-top:12px}
.skel{color:var(--muted);font-family:var(--mono);font-size:.8125rem}
h2{font-size:1.15rem;margin:0 0 12px}
</style>`,
        body: `
<header>
  <span class="brand">${BRAND_MARK} Sentifix</span>
  <span class="tag">Operator console</span>
</header>
<main id="root"><p class="skel">…</p></main>
<script>
(function () {
  var KEY = 'sentifix_admin_key';
  var root = document.getElementById('root');
  var models = [];

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function key() { return sessionStorage.getItem(KEY) || ''; }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'x-api-key': key() }, opts.headers || {});
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) { sessionStorage.removeItem(KEY); gate('That key was rejected.'); return null; }
      if (!r.ok) throw new Error('Request failed (' + r.status + ')');
      return r.json();
    });
  }

  function gate(msg) {
    root.innerHTML =
      '<div class="gate"><p class="eyebrow">Operator access</p>' +
      '<p class="muted" style="color:var(--muted);font-size:.9rem">This console holds no data until you authenticate. ' +
      'The key is kept for this browser tab only.</p>' +
      '<input id="k" type="password" placeholder="ADMIN_API_KEY" autocomplete="off">' +
      '<button class="btn btn-primary btn-sm" id="in">Unlock</button>' +
      (msg ? '<p class="err">' + esc(msg) + '</p>' : '') + '</div>';
    document.getElementById('in').addEventListener('click', function () {
      var v = document.getElementById('k').value.trim();
      if (!v) return;
      sessionStorage.setItem(KEY, v);
      load();
    });
    document.getElementById('k').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') document.getElementById('in').click();
    });
  }

  function chip(rec) {
    if (rec === 'move_up') return '<span class="chip up">Move up</span>';
    if (rec === 'move_down') return '<span class="chip down">Move down</span>';
    return '<span class="chip ok">Healthy</span>';
  }

  function options(sel) {
    return '<option value="">Default</option>' + models.map(function (m) {
      return '<option value="' + esc(m.key) + '"' + (m.key === sel ? ' selected' : '') + '>' +
        esc(m.label) + ' · ' + m.creditsPerRun + ' cr</option>';
    }).join('');
  }

  function render(data) {
    var t = data.totals;
    root.innerHTML =
      '<p class="eyebrow">Tenants</p>' +
      '<dl class="stats">' +
        '<div class="stat"><dt>Tenants</dt><dd>' + t.tenants + '</dd></div>' +
        '<div class="stat"><dt>Should move up</dt><dd>' + t.moveUp + '</dd></div>' +
        '<div class="stat"><dt>Should move down</dt><dd>' + t.moveDown + '</dd></div>' +
      '</dl>' +
      (data.tenants.length === 0
        ? '<p class="skel">No tenants yet.</p>'
        : '<div class="rows">' + data.tenants.map(function (x) {
            return '<div class="row">' + chip(x.recommendation) +
              '<div><div class="who">' + esc(x.label) + ' <span class="muted" style="color:var(--muted);font-weight:400">· ' +
                esc(x.provider) + '</span></div>' +
              '<div class="why">' + esc(x.reason) + '</div></div>' +
              '<div class="num">' + x.marginCredits + '<small>margin ' + x.marginPercent + '%</small></div>' +
              '<select data-p="' + esc(x.provider) + '" data-e="' + esc(x.externalId) + '">' +
                options(x.modelKey) + '</select></div>';
          }).join('') + '</div>');

    Array.prototype.forEach.call(root.querySelectorAll('select'), function (s) {
      s.addEventListener('change', function () {
        s.disabled = true;
        api('/admin/tenants/' + s.dataset.p + '/' + encodeURIComponent(s.dataset.e), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelKey: s.value || null }),
        }).then(function () { load(); })
          .catch(function (e) {
            s.disabled = false;
            root.insertAdjacentHTML('beforeend', '<p class="err">' + esc(e.message) + '</p>');
          });
      });
    });
  }

  function load() {
    if (!key()) return gate();
    root.innerHTML = '<p class="skel">Loading tenants…</p>';
    Promise.all([api('/admin/models'), api('/admin/insights')])
      .then(function (r) {
        if (!r[0] || !r[1]) return;
        models = r[0];
        render(r[1]);
      })
      .catch(function (e) { root.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  load();
})();
</script>`,
      }),
    );
  }
}
