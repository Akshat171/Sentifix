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

.tabs{display:flex;gap:4px;margin-bottom:22px}
.tabs button{font:inherit;font-size:.8125rem;padding:6px 13px;border-radius:8px;border:1px solid transparent;background:none;color:var(--muted);cursor:pointer}
.tabs button:hover{background:var(--sunk);color:var(--ink)}
.tabs button[aria-selected="true"]{background:var(--accent-wash);color:var(--accent-text);font-weight:600}
.stat dd.money{color:var(--del)}
.stat dd.earn{color:var(--add)}
.stat dd small{display:block;font-size:.625rem;font-weight:400;color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin-top:3px;font-family:var(--mono)}
.chart{display:flex;align-items:flex-end;gap:3px;height:110px;padding:12px 14px;background:var(--surface);border:1px solid var(--line);border-radius:10px;margin-bottom:8px}
.bar{flex:1;min-width:4px;background:var(--accent);border-radius:2px 2px 0 0;opacity:.85;position:relative}
.bar:hover{opacity:1}
.bar.zero{background:var(--line);opacity:.5;min-height:2px}
.chart-foot{display:flex;justify-content:space-between;font-family:var(--mono);font-size:.65rem;color:var(--muted);margin-bottom:26px}
table.spend{width:100%;border-collapse:collapse;background:var(--surface);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin-bottom:26px}
table.spend th{text-align:left;font-family:var(--mono);font-size:.62rem;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);font-weight:500;padding:10px 14px;border-bottom:1px solid var(--line)}
table.spend td{padding:11px 14px;border-bottom:1px solid var(--line);font-size:.8125rem}
table.spend tr:last-child td{border-bottom:0}
table.spend td.n{font-family:var(--mono);text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
table.spend td.name{font-family:var(--mono);font-size:.78rem}
.note{border:1px solid var(--line);border-left:3px solid var(--sev-medium);border-radius:9px;background:var(--surface);padding:13px 16px;font-size:.8125rem;color:var(--muted);line-height:1.6}
.note b{color:var(--ink);font-weight:600}
.note ul{margin:7px 0 0;padding-left:18px}
</style>`,
        body: `
<header>
  <span class="brand">${BRAND_MARK} Sentifix</span>
  <span class="tag">Operator console</span>
</header>
<main>
  <div class="tabs" id="tabs" hidden>
    <button data-view="spend" aria-selected="true">Cost &amp; credits</button>
    <button data-view="tenants" aria-selected="false">Tenants</button>
  </div>
  <div id="root"><p class="skel">…</p></div>
</main>
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

  // ── Cost & credits ────────────────────────────────────────────────────────
  // Answers "what is this costing me" without opening the provider's dashboard:
  // vendor dollars come from the stored markup, so the two halves — what the
  // vendor charged and what customers were charged — sit side by side, which is
  // the comparison no provider dashboard can show you.

  function usd(n) { return '$' + (Math.round(n * 100) / 100).toFixed(2); }
  function cr(n) { return (Math.round(n * 100) / 100).toFixed(2); }
  function tokens(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return Math.round(n / 1e3) + 'k';
    return String(n);
  }

  function chart(daily) {
    if (!daily.length) return '<p class="skel">No spend recorded yet.</p>';
    var peak = Math.max.apply(null, daily.map(function (d) { return d.vendorUsd; })) || 1;
    return '<div class="chart">' + daily.map(function (d) {
      var h = Math.max(2, Math.round((d.vendorUsd / peak) * 100));
      return '<div class="bar' + (d.vendorUsd ? '' : ' zero') + '" style="height:' + h + '%" ' +
        'title="' + esc(d.day) + ': ' + usd(d.vendorUsd) + ' vendor · ' + d.runs + ' run(s)"></div>';
    }).join('') + '</div>' +
    '<div class="chart-foot"><span>' + esc(daily[0].day) + '</span>' +
      '<span>peak ' + usd(peak) + '/day</span>' +
      '<span>' + esc(daily[daily.length - 1].day) + '</span></div>';
  }

  function spendTable(title, rows, label) {
    if (!rows.length) return '';
    return '<h2>' + title + '</h2><table class="spend"><thead><tr>' +
      '<th>' + label + '</th><th style="text-align:right">Vendor cost</th>' +
      '<th style="text-align:right">Charged</th><th style="text-align:right">Margin</th>' +
      '<th style="text-align:right">Tokens</th><th style="text-align:right">Runs</th>' +
      '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr><td class="name">' + esc(r.modelKey || r.name) + '</td>' +
          '<td class="n">' + usd(r.vendorUsd) + '</td>' +
          '<td class="n">' + cr(r.credits) + ' cr</td>' +
          '<td class="n" style="color:' + (r.marginUsd >= 0 ? 'var(--add)' : 'var(--del)') + '">' +
            usd(r.marginUsd) + '</td>' +
          '<td class="n">' + tokens(r.inputTokens + r.outputTokens) + '</td>' +
          '<td class="n">' + r.runs + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderSpend(d) {
    var t = d.last30;
    root.innerHTML =
      '<p class="eyebrow">What you are paying the provider</p>' +
      '<dl class="stats">' +
        '<div class="stat"><dt>Today</dt><dd class="money">' + usd(d.today.vendorUsd) +
          '<small>' + d.today.runs + ' run(s)</small></dd></div>' +
        '<div class="stat"><dt>Last 7 days</dt><dd class="money">' + usd(d.last7.vendorUsd) + '</dd></div>' +
        '<div class="stat"><dt>Last 30 days</dt><dd class="money">' + usd(t.vendorUsd) + '</dd></div>' +
        '<div class="stat"><dt>All time</dt><dd class="money">' + usd(d.allTime.vendorUsd) + '</dd></div>' +
      '</dl>' +
      '<p class="eyebrow">What you charged for it · last 30 days</p>' +
      '<dl class="stats">' +
        '<div class="stat"><dt>Credits burnt</dt><dd>' + cr(t.credits) + '</dd></div>' +
        '<div class="stat"><dt>Sale value</dt><dd class="earn">' + usd(t.credits / 100) + '</dd></div>' +
        '<div class="stat"><dt>Gross margin</dt><dd class="' + (t.marginUsd >= 0 ? 'earn' : 'money') + '">' +
          usd(t.marginUsd) +
          '<small>' + (t.credits > 0 ? Math.round((t.marginUsd / (t.credits / 100)) * 100) + '%' : '—') +
          '</small></dd></div>' +
        '<div class="stat"><dt>Tokens</dt><dd>' + tokens(t.inputTokens + t.outputTokens) +
          '<small>' + tokens(t.inputTokens) + ' in · ' + tokens(t.outputTokens) + ' out</small></dd></div>' +
      '</dl>' +
      '<h2>Daily vendor cost</h2>' + chart(d.daily) +
      spendTable('By model · last 30 days', d.byModel, 'Model') +
      spendTable('By tenant · last 30 days', d.byTenant, 'Account') +
      '<div class="note"><b>What this does not count.</b>' +
        '<ul>' + d.coverage.blindSpots.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul>' +
        (d.coverage.firstRecord
          ? '<p style="margin-top:8px">Metering began ' + esc(d.coverage.firstRecord.slice(0, 10)) +
            '. Anything earlier appears on the vendor bill but not here.</p>'
          : '') +
      '</div>';
  }

  var view = 'spend';

  function loadSpend() {
    root.innerHTML = '<p class="skel">Loading cost…</p>';
    api('/admin/spend')
      .then(function (d) { if (d) renderSpend(d); })
      .catch(function (e) { root.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  function loadTenants() {
    root.innerHTML = '<p class="skel">Loading tenants…</p>';
    Promise.all([api('/admin/models'), api('/admin/insights')])
      .then(function (r) {
        if (!r[0] || !r[1]) return;
        models = r[0];
        render(r[1]);
      })
      .catch(function (e) { root.innerHTML = '<p class="err">' + esc(e.message) + '</p>'; });
  }

  function load() {
    var tabs = document.getElementById('tabs');
    if (!key()) { tabs.hidden = true; return gate(); }
    tabs.hidden = false;
    if (view === 'spend') loadSpend(); else loadTenants();
  }

  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) {
    b.addEventListener('click', function () {
      view = b.dataset.view;
      Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (o) {
        o.setAttribute('aria-selected', String(o === b));
      });
      load();
    });
  });

  load();
})();
</script>`,
      }),
    );
  }
}
