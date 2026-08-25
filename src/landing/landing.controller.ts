import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BRAND_MARK, GITHUB_ICON, SLACK_ICON, page } from '../ui/theme';

@Controller()
export class LandingController {
  private readonly installUrl: string;

  constructor(config: ConfigService) {
    const slug = config.get<string>('GITHUB_APP_SLUG');
    this.installUrl = slug ? `https://github.com/apps/${slug}/installations/new` : '/setup';
  }

  @Get()
  @Header('Content-Type', 'text/html; charset=utf-8')
  serve(): string {
    const install = this.installUrl;

    return page({
      title: 'Sentifix — every bug report arrives with a fix attached',
      description:
        'An open-source AI agent that reads your GitHub issues, finds the root cause in your code, and replies with a proposed patch.',
      head: `<style>
.nav{border-bottom:1px solid var(--line);background:var(--ground)}
.nav-in{display:flex;align-items:center;gap:28px;height:66px}
.nav-links{display:none;gap:26px;margin-left:auto}
.nav-links a{font-size:.9375rem;color:var(--muted);text-decoration:none}
.nav-links a:hover{color:var(--ink)}
@media (min-width:860px){.nav-links{display:flex}}
.nav-cta{margin-left:auto}
@media (min-width:860px){.nav-cta{margin-left:0}}

.hero{padding-block:clamp(52px,8vw,92px) clamp(44px,6vw,72px)}
.hero-grid{display:grid;gap:clamp(40px,5vw,64px);align-items:center}
@media (min-width:980px){.hero-grid{grid-template-columns:1fr 1.08fr}}
.hero-copy{display:flex;flex-direction:column;gap:22px;align-items:flex-start}
.hero-sub{font-size:1.1875rem;color:var(--muted);max-width:46ch}
.hero-actions{display:flex;align-items:center;gap:20px;flex-wrap:wrap}

.trust{margin-top:clamp(40px,5vw,60px);padding-top:26px;border-top:1px solid var(--line)}
.trust-row{display:flex;flex-wrap:wrap;gap:10px 30px;align-items:center;font-family:var(--mono);font-size:.8125rem;color:var(--muted)}
.trust-row strong{color:var(--ink);font-weight:600}

.mock{background:var(--surface);border:1px solid var(--line);border-radius:12px;box-shadow:var(--shadow);overflow:hidden;font-size:.875rem}
.mock-bar{display:flex;align-items:center;gap:8px;padding:11px 15px;border-bottom:1px solid var(--line);background:var(--sunk)}
.mock-dot{width:9px;height:9px;border-radius:50%;background:var(--line)}
.mock-path{font-family:var(--mono);font-size:.75rem;color:var(--muted);margin-left:6px}
.mock-body{padding:18px 18px 20px;display:flex;flex-direction:column;gap:14px}
.issue-title{font-weight:600;font-size:1rem;line-height:1.35}
.issue-meta{font-family:var(--mono);font-size:.75rem;color:var(--muted)}
.comment{border:1px solid var(--line);border-radius:9px;overflow:hidden}
.comment-head{display:flex;align-items:center;gap:9px;flex-wrap:wrap;padding:10px 13px;background:var(--accent-wash);border-bottom:1px solid var(--line)}
.avatar{width:20px;height:20px;border-radius:5px;background:var(--accent);display:grid;place-items:center;color:#FFF;font-family:var(--mono);font-size:.625rem;font-weight:700;flex:none}
.who{font-weight:600;font-size:.8125rem}
.badge{font-family:var(--mono);font-size:.625rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;padding:2px 7px;border-radius:4px;background:var(--surface);border:1px solid var(--line);color:var(--muted)}
.comment-body{padding:13px;display:flex;flex-direction:column;gap:11px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip-hot{background:var(--del-wash);color:var(--del);border-color:transparent}
.finding{font-size:.8125rem;line-height:1.55}
.finding code{font-size:.78125rem;background:var(--sunk);padding:1px 5px;border-radius:4px}
.diff{border:1px solid var(--line);border-radius:7px;overflow:hidden;font-family:var(--mono);font-size:.75rem;line-height:1.75}
.diff-head{padding:6px 11px;background:var(--sunk);color:var(--muted);border-bottom:1px solid var(--line);font-size:.6875rem}
.diff-scroll{overflow-x:auto}
.diff-row{display:flex;gap:12px;padding:0 11px;white-space:pre}
.diff-row .n{color:var(--muted);opacity:.6;user-select:none;min-width:1.6em;text-align:right}
.d-add{background:var(--add-wash);color:var(--add)}
.d-del{background:var(--del-wash);color:var(--del)}
.verdict{display:flex;align-items:center;gap:7px;font-family:var(--mono);font-size:.6875rem;color:var(--muted)}
.tick{color:var(--add);font-weight:700}

.band{padding-block:clamp(60px,8vw,96px);border-top:1px solid var(--line)}
/* Video player. Click-to-play with a poster: the launch film is 72s and nobody
   should pay for it on page load, so the <video> carries preload="none" and no
   bytes move until the poster is clicked. */
.player{position:relative;margin-inline:auto;border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--sunk);box-shadow:var(--shadow);aspect-ratio:16/9;max-width:1040px}
.player video{display:block;width:100%;height:100%;object-fit:contain;background:var(--sunk)}
/* Narrow screens get the 9:16 cut, so the frame follows it. Capped by viewport
   height or a tall video pushes the whole page around on a phone. */
.player[data-orientation="vertical"]{aspect-ratio:9/16;max-width:min(420px,88vw);max-height:78vh}
.player-btn{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:12px;border:0;background:transparent;cursor:pointer;color:var(--ink);font:inherit;padding:0}
.player-btn:focus-visible{outline:2px solid var(--accent);outline-offset:-4px}
.player-btn .disc{display:flex;align-items:center;justify-content:center;width:76px;height:76px;border-radius:50%;background:var(--accent);box-shadow:0 10px 30px -8px rgb(0 0 0 / .55);transition:transform .16s ease}
.player-btn:hover .disc{transform:scale(1.06)}
.player-btn .disc svg{width:28px;height:28px;margin-left:4px;fill:#fff}
.player-btn .cap{position:absolute;left:0;right:0;bottom:14px;text-align:center;font-family:var(--mono);font-size:.75rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.player.is-playing .player-btn{display:none}
@media (prefers-reduced-motion:reduce){.player-btn .disc{transition:none}}
.band-head{display:flex;flex-direction:column;gap:14px;margin-bottom:clamp(36px,4vw,52px)}
.cards{display:grid;gap:22px}
@media (min-width:760px){.cards{grid-template-columns:repeat(3,1fr)}}
.cards .card{padding:26px 24px 28px;display:flex;flex-direction:column;gap:12px}
.cards .card p{color:var(--muted);font-size:.9375rem}
.ico{width:26px;height:26px;stroke:var(--accent);fill:none;stroke-width:1.6}

.intake{display:grid;gap:22px}
@media (min-width:820px){.intake{grid-template-columns:1fr 1fr}}
.lane{display:flex;flex-direction:column;gap:14px;padding:26px 24px 28px}
.lane-h{display:flex;align-items:center;gap:10px;font-family:var(--mono);font-size:.875rem;font-weight:600;letter-spacing:-.01em}
.lane p{color:var(--muted);font-size:.9375rem}
.lane-note{font-size:.8125rem;margin-top:auto;padding-top:4px;border-top:1px solid var(--line)}
.slack-thread{display:flex;flex-direction:column;gap:10px;background:var(--sunk);border:1px solid var(--line);border-radius:9px;padding:14px}
.slack-msg{display:flex;flex-direction:column;gap:3px;font-size:.8125rem;line-height:1.5}
.slack-reply{padding-left:12px;border-left:2px solid var(--accent)}
.slack-who{font-family:var(--mono);font-size:.6875rem;font-weight:700;color:var(--muted);display:flex;align-items:center;gap:6px}
.slack-msg code{font-size:.75rem;background:var(--surface);border:1px solid var(--line);padding:1px 5px;border-radius:4px}

.steps{display:grid;gap:2px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
@media (min-width:860px){.steps{grid-template-columns:repeat(3,1fr)}}
.step{background:var(--surface);padding:28px 24px 30px;display:flex;flex-direction:column;gap:11px}
.step-n{font-family:var(--mono);font-size:.6875rem;font-weight:700;letter-spacing:.1em;color:var(--accent-text)}
.step p{color:var(--muted);font-size:.9375rem}

.quote-grid{display:grid;gap:22px}
@media (min-width:860px){.quote-grid{grid-template-columns:1.25fr 1fr}}
.quote{display:flex;flex-direction:column;gap:18px;padding:30px 28px}
.quote blockquote{font-size:1.125rem;line-height:1.55}
.quote figcaption{font-family:var(--mono);font-size:.75rem;color:var(--muted)}
.stat-stack{display:grid;gap:22px;align-content:start}
.stat{padding:22px 24px}
.stat-n{font-family:var(--mono);font-size:2rem;font-weight:600;letter-spacing:-.03em;color:var(--accent-text);font-variant-numeric:tabular-nums;display:block}
.stat-l{font-size:.875rem;color:var(--muted)}

.tiers{display:grid;gap:22px;align-items:start}
@media (min-width:880px){.tiers{grid-template-columns:repeat(3,1fr)}}
.tier{padding:28px 26px 30px;display:flex;flex-direction:column;gap:18px}
.tier-featured{border-color:var(--accent);box-shadow:var(--shadow)}
.tier-name{display:flex;align-items:center;gap:10px}
.tag{font-family:var(--mono);font-size:.625rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#FFF;background:var(--accent);padding:3px 8px;border-radius:4px}
.price{font-family:var(--mono);font-size:2.25rem;font-weight:600;letter-spacing:-.035em}
.price span{font-size:.875rem;font-weight:500;color:var(--muted);letter-spacing:0}
.tier ul{list-style:none;display:grid;gap:10px;font-size:.9375rem}
.tier li{display:flex;gap:10px;color:var(--muted)}
.tier li::before{content:"+";font-family:var(--mono);color:var(--add);font-weight:700;flex:none}
.tier .lede{font-size:.9375rem}

.faq{display:grid;border-top:1px solid var(--line);max-width:76ch}
details{border-bottom:1px solid var(--line)}
summary{cursor:pointer;list-style:none;padding:20px 34px 20px 0;position:relative;font-weight:600;font-size:1.0625rem;letter-spacing:-.01em}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";position:absolute;right:4px;top:18px;font-family:var(--mono);font-size:1.25rem;font-weight:400;color:var(--accent)}
details[open] summary::after{content:"\\2212"}
details p{padding-bottom:22px;color:var(--muted);max-width:68ch}

.cta-band{border-top:1px solid var(--line);padding-block:clamp(60px,8vw,92px);background:var(--sunk)}
.cta-in{display:flex;flex-direction:column;gap:22px;align-items:flex-start}
@media (min-width:820px){.cta-in{flex-direction:row;align-items:center;justify-content:space-between;gap:40px}}
footer{border-top:1px solid var(--line);padding-block:34px}
.foot{display:flex;flex-wrap:wrap;gap:14px 28px;align-items:center;font-size:.875rem;color:var(--muted)}
.foot a{text-decoration:none}
.foot a:hover{color:var(--ink)}
.foot-end{margin-left:auto;font-family:var(--mono);font-size:.75rem}

@media (prefers-reduced-motion:no-preference){
  .rise{animation:rise .5s cubic-bezier(.2,.7,.3,1) backwards}
  .rise:nth-child(2){animation-delay:.06s}
  .mock{animation:rise .6s .1s cubic-bezier(.2,.7,.3,1) backwards}
  @keyframes rise{from{opacity:0;transform:translateY(10px)}}
}
</style>`,
      body: `
<header class="nav">
  <div class="wrap nav-in">
    <a class="brand" href="#top">${BRAND_MARK}Sentifix</a>
    <nav class="nav-links" aria-label="Main">
      <a href="#how">How it works</a>
      <a href="#pricing">Pricing</a>
      <a href="#faq">FAQ</a>
      <a href="/dashboard">Dashboard</a>
    </nav>
    <a class="btn btn-outline nav-cta" href="${install}">Install on GitHub</a>
  </div>
</header>

<main id="top">
  <section class="hero">
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <span class="label rise">Open-source issue triage</span>
        <h1 class="rise">Every bug report arrives with a fix attached.</h1>
        <p class="hero-sub rise">Sentifix reads each new GitHub issue, traces it back to the code that caused it, and replies with a root cause and a working patch — usually within 30 seconds of the issue being opened.</p>
        <div class="hero-actions rise">
          <a class="btn btn-primary" href="${install}">${GITHUB_ICON} Install on GitHub</a>
          <a class="btn btn-quiet" href="#example">See a real triage</a>
        </div>
      </div>

      <div class="mock" role="img" aria-label="A GitHub issue thread where Sentifix has replied with a root-cause diagnosis and a proposed code patch.">
        <div class="mock-bar">
          <span class="mock-dot" aria-hidden="true"></span><span class="mock-dot" aria-hidden="true"></span><span class="mock-dot" aria-hidden="true"></span>
          <span class="mock-path">acme/checkout · issue #482</span>
        </div>
        <div class="mock-body">
          <p class="issue-title">Discount codes silently ignored when cart total is exactly £50</p>
          <p class="issue-meta">opened 31 seconds ago by @priyawrites · 1 comment</p>
          <div class="comment">
            <div class="comment-head">
              <span class="avatar" aria-hidden="true">S</span>
              <span class="who">sentifix</span>
              <span class="badge">bot</span>
              <span class="badge">triaged in 24s</span>
            </div>
            <div class="comment-body">
              <div class="chips">
                <span class="chip chip-hot">severity: high</span>
                <span class="chip">pricing</span>
                <span class="chip">regression</span>
              </div>
              <p class="finding"><strong>Root cause.</strong> The eligibility check in <code>applyDiscount()</code> uses <code>&gt;</code> where the threshold is meant to be inclusive, so a cart at exactly the minimum is rejected.</p>
              <div class="diff">
                <div class="diff-head">src/pricing/discount.ts</div>
                <div class="diff-scroll">
                  <div class="diff-row"><span class="n">41</span><span>  const threshold = rule.minSubtotal;</span></div>
                  <div class="diff-row d-del"><span class="n">42</span><span>- if (subtotal &gt; threshold) {</span></div>
                  <div class="diff-row d-add"><span class="n">42</span><span>+ if (subtotal &gt;= threshold) {</span></div>
                  <div class="diff-row"><span class="n">43</span><span>    return applyRule(rule, subtotal);</span></div>
                </div>
              </div>
              <p class="verdict"><span class="tick" aria-hidden="true">&#10003;</span> Patch reviewed and scored before posting · 3 related tests found</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="wrap trust">
      <div class="trust-row">
        <span><strong>MIT licensed</strong> — read every line</span>
        <span><strong>Self-host it</strong> — your code never leaves your infra</span>
        <span><strong>GitHub and Slack</strong> — report from either</span>
        <span><strong>Runs in ~30s</strong> per issue</span>
      </div>
    </div>
  </section>

  <section class="band" id="watch">
    <div class="wrap">
      <div class="band-head">
        <span class="label">The pipeline, end to end</span>
        <h2>Watch it work.</h2>
        <p class="lede">Seventy-two seconds: an issue classified, the repository searched, a root cause found, a patch written, and the patch scored. The diff and the score on screen are the real output of a real run.</p>
      </div>
      <div class="player" data-player
           data-src-wide="/static/media/launch-16x9.mp4"
           data-src-tall="/static/media/launch-9x16.mp4"
           data-poster-wide="/static/media/launch-poster-16x9.jpg"
           data-poster-tall="/static/media/launch-poster-9x16.jpg">
        <video
          preload="none"
          playsinline
          controls
          poster="/static/media/launch-poster-16x9.jpg"
          src="/static/media/launch-16x9.mp4"
          aria-label="Sentifix triaging a GitHub issue: classification, retrieval over the repository, root-cause diagnosis, a proposed patch, and the patch's evaluation score."
        ></video>
        <button class="player-btn" type="button" aria-label="Play the Sentifix launch video">
          <span class="disc" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></span>
          <span class="cap">72 seconds &middot; no sound</span>
        </button>
      </div>
    </div>
    <script>
(function () {
  var box = document.querySelector('[data-player]');
  if (!box) return;
  var video = box.querySelector('video');
  var btn = box.querySelector('.player-btn');
  // Portrait-ish viewports get the 9:16 cut. Chosen once, before any bytes are
  // fetched, and never swapped mid-playback -- a resize should not restart it.
  var tall = window.matchMedia('(max-width: 700px)').matches;
  if (tall) {
    box.setAttribute('data-orientation', 'vertical');
    video.poster = box.dataset.posterTall;
    video.src = box.dataset.srcTall;
  }
  btn.addEventListener('click', function () {
    box.classList.add('is-playing');
    var p = video.play();
    // Autoplay policies can still reject; surface the controls either way.
    if (p && p.catch) p.catch(function () { video.controls = true; });
  });
})();
</script>
  </section>

  <section class="band" id="example">
    <div class="wrap">
      <div class="band-head">
        <span class="label">Why teams turn it on</span>
        <h2>Your backlog stops growing faster than you can read it.</h2>
        <p class="lede">Triage is the tax on every popular repository. Sentifix pays it for you, and shows its work.</p>
      </div>
      <div class="cards">
        <article class="card">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h10" stroke-linecap="round"/><circle cx="19" cy="18" r="3"/></svg>
          <h3>Know what matters before you open the tab</h3>
          <p>Every issue arrives labelled with severity, category, and the components it touches — so the queue sorts itself and the urgent things surface first.</p>
        </article>
        <article class="card">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h9l7 7v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M13 4v7h7" stroke-linecap="round"/><path d="M8 15h6" stroke-linecap="round"/></svg>
          <h3>Skip the hour spent finding the right file</h3>
          <p>Sentifix indexes your repository and searches it the way a reviewer would — following stack traces and imports, not just matching words — then names the exact lines at fault.</p>
        </article>
        <article class="card">
          <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12" stroke-linecap="round"/><path d="m7 10 5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 19h16" stroke-linecap="round"/></svg>
          <h3>Start from a patch, not a blank editor</h3>
          <p>You get a real unified diff you can read, argue with, or apply. Nothing is ever pushed or merged — the change stays a suggestion until a human says otherwise.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="band" id="slack">
    <div class="wrap">
      <div class="band-head">
        <span class="label">Two ways in</span>
        <h2>Not every bug report starts as a GitHub issue.</h2>
        <p class="lede">Plenty of them start as someone in a channel saying “hey, checkout is broken again”. Sentifix takes that as a report too — mention it, and the triage comes back in the thread.</p>
      </div>
      <div class="intake">
        <article class="card lane">
          <span class="lane-h">${GITHUB_ICON} On GitHub</span>
          <p>Someone opens an issue. Sentifix picks it up from the webhook and replies on the thread with the diagnosis and a patch.</p>
          <p class="lane-note">Best for reports that already have a stack trace or a reproduction.</p>
        </article>
        <article class="card lane">
          <span class="lane-h">${SLACK_ICON} In Slack</span>
          <div class="slack-thread">
            <div class="slack-msg">
              <span class="slack-who">priya</span>
              <span>@sentifix discount codes aren't applying on £50 carts</span>
            </div>
            <div class="slack-msg slack-reply">
              <span class="slack-who">Sentifix <span class="badge">app</span></span>
              <span>Root cause in <code>applyDiscount()</code> — inclusive threshold compared with <code>&gt;</code>. Patch and eval score attached.</span>
            </div>
          </div>
          <p class="lane-note">Best for the reports that would otherwise never become issues at all.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="band" id="how">
    <div class="wrap">
      <div class="band-head">
        <span class="label">How it works</span>
        <h2>Three steps, and none of them are yours.</h2>
        <p class="lede">Install once. Everything after that happens on its own, in the open, in the issue thread.</p>
      </div>
      <div class="steps">
        <article class="step">
          <span class="step-n">STEP 01</span>
          <h3>An issue is opened</h3>
          <p>Sentifix picks it up from the webhook and classifies it — what kind of bug, how severe, which parts of the system it touches.</p>
        </article>
        <article class="step">
          <span class="step-n">STEP 02</span>
          <h3>It reads your code</h3>
          <p>It searches the indexed repository for the code the report points at, pulls in the surrounding context, and works out the root cause.</p>
        </article>
        <article class="step">
          <span class="step-n">STEP 03</span>
          <h3>It posts a fix</h3>
          <p>A comment lands on the issue with the diagnosis and a proposed diff — already scored for correctness and safety before you ever see it.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="band">
    <div class="wrap">
      <div class="band-head">
        <span class="label">Built to be checked</span>
        <h2>Every patch is graded before it reaches you.</h2>
        <p class="lede">An AI that guesses confidently is worse than no AI at all. So Sentifix scores its own output against the issue it was given, and that score ships with the suggestion.</p>
      </div>
      <div class="quote-grid">
        <figure class="card quote">
          <blockquote>“Replace this with a real quote once you have one — a maintainer describing what triage cost them before, and what it costs now.”</blockquote>
          <figcaption>Placeholder — swap in a real name, role, and repository</figcaption>
        </figure>
        <div class="stat-stack">
          <div class="card stat">
            <span class="stat-n">3</span>
            <span class="stat-l">independent scores on every patch — correctness, completeness, and safety</span>
          </div>
          <div class="card stat">
            <span class="stat-n">0</span>
            <span class="stat-l">commits pushed without a human approving them first</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="band" id="pricing">
    <div class="wrap">
      <div class="band-head">
        <span class="label">Pricing</span>
        <h2>Free if you host it. Cheap if you don't.</h2>
        <p class="lede">The whole thing is open source. Paying is for people who would rather not run a queue, a database, and a vector store themselves.</p>
      </div>
      <div class="tiers">
        <article class="card tier">
          <div class="tier-name"><h3>Self-hosted</h3></div>
          <p class="price">£0</p>
          <p class="lede">Run it on your own box with your own API keys.</p>
          <ul>
            <li>Unlimited repositories</li>
            <li>Unlimited triage runs</li>
            <li>Docker Compose, one command</li>
            <li>Community support</li>
          </ul>
          <a class="btn btn-outline" href="https://github.com/Akshat171/Sentifix">Read the docs</a>
        </article>
        <article class="card tier tier-featured">
          <div class="tier-name"><h3>Team</h3><span class="tag">Most teams</span></div>
          <p class="price">£49<span> / month</span></p>
          <p class="lede">Hosted, maintained, and watching your repos.</p>
          <ul>
            <li>10 repositories</li>
            <li>200 triaged issues each month</li>
            <li>Slack reporting and replies</li>
            <li>Quality scores on every patch</li>
            <li>Email support</li>
          </ul>
          <a class="btn btn-primary" href="${install}">Start free trial</a>
        </article>
        <article class="card tier">
          <div class="tier-name"><h3>Scale</h3></div>
          <p class="price">Talk to us</p>
          <p class="lede">For busy monorepos and larger organisations.</p>
          <ul>
            <li>Unlimited repositories</li>
            <li>Volume triage pricing</li>
            <li>Private deployment in your account</li>
            <li>Priority support</li>
          </ul>
          <a class="btn btn-outline" href="${install}">Get in touch</a>
        </article>
      </div>
    </div>
  </section>

  <section class="band" id="faq">
    <div class="wrap">
      <div class="band-head">
        <span class="label">Questions</span>
        <h2>The things people ask first.</h2>
      </div>
      <div class="faq">
        <details>
          <summary>Does it push code to my repository?</summary>
          <p>No. Sentifix writes a comment containing a proposed diff. Applying it, editing it, or ignoring it is entirely your call — nothing reaches a branch until you approve it from the dashboard.</p>
        </details>
        <details>
          <summary>Where does my source code go?</summary>
          <p>If you self-host, nowhere — the index lives in your own database on your own infrastructure. On the hosted plan, your repository is indexed on our servers and used only to answer issues in that repository.</p>
        </details>
        <details>
          <summary>Which languages does it work with?</summary>
          <p>Any language in your repository can be indexed and searched. Patch quality is strongest where the codebase has clear structure and the issue includes a stack trace or a reproduction.</p>
        </details>
        <details>
          <summary>What if the suggested fix is wrong?</summary>
          <p>Sometimes it will be. That's why every patch is scored before posting and nothing is applied automatically. Treat a Sentifix comment as a well-prepared first draft from a reviewer who has already read the code.</p>
        </details>
        <details>
          <summary>Can I control which issues it responds to?</summary>
          <p>Yes. Run it on everything, restrict it to a single label, or trigger it manually by commenting <code>/sentifix</code> on the issues you want looked at.</p>
        </details>
        <details>
          <summary>What access does the Slack app need?</summary>
          <p>Three scopes: read the mentions addressed to it, and post messages. It cannot read channel history, browse other conversations, or see anything it wasn't explicitly mentioned in.</p>
        </details>
        <details>
          <summary>How long does setup take?</summary>
          <p>Install the GitHub App, pick your repositories, and the first index runs immediately. Most teams see their first triaged issue within a few minutes.</p>
        </details>
      </div>
    </div>
  </section>

  <section class="cta-band">
    <div class="wrap cta-in">
      <div style="display:flex;flex-direction:column;gap:12px">
        <h2>Point it at one noisy repository.</h2>
        <p class="lede">Free to try, no card, and you can uninstall it in two clicks if it isn't pulling its weight.</p>
      </div>
      <a class="btn btn-primary" href="${install}">${GITHUB_ICON} Install on GitHub</a>
    </div>
  </section>
</main>

<footer>
  <div class="wrap foot">
    <a class="brand" href="#top" style="font-size:.9375rem">${BRAND_MARK}Sentifix</a>
    <a href="https://github.com/Akshat171/Sentifix">Source</a>
    <a href="/setup">Setup</a>
    <a href="/dashboard">Dashboard</a>
    <span class="foot-end">MIT licensed · sentifix.dev</span>
  </div>
</footer>`,
    });
  }
}
