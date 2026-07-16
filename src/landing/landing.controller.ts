import { Controller, Get, Header } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sentifix — bug reports, triaged into pull requests</title>
  <meta name="description" content="An open-source AI agent that reads your GitHub issues, finds the root cause in your code, and opens a pull request with the fix.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;450;500;600&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{
      --paper:#f6f2ea; --paper-2:#fdfbf6; --raised:#fffdf9;
      --ink:#26221c; --ink-soft:#6b655a; --ink-faint:#9c968a;
      --line:#e7ddcd; --line-soft:#efe8db;
      --clay:#c96442; --clay-2:#b1543440; --clay-ink:#a24327;
      --sage:#5c6b52;
      --shadow:0 1px 2px rgba(60,50,35,.04),0 8px 30px rgba(60,50,35,.06);
      --serif:'Fraunces',Georgia,'Times New Roman',serif;
      --sans:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    }
    html{scroll-behavior:smooth}
    body{font-family:var(--sans);background:var(--paper);color:var(--ink);line-height:1.6;-webkit-font-smoothing:antialiased;font-size:17px}
    a{color:inherit;text-decoration:none}
    .wrap{max-width:1120px;margin:0 auto;padding:0 32px}
    .serif{font-family:var(--serif);font-weight:500;letter-spacing:-.01em}
    .eyebrow{font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--clay-ink)}

    /* nav */
    header{position:sticky;top:0;z-index:20;background:rgba(246,242,234,.8);backdrop-filter:blur(10px);border-bottom:1px solid transparent;transition:border-color .2s}
    header .bar{display:flex;align-items:center;gap:14px;padding:20px 0}
    .brand{font-family:var(--serif);font-weight:600;font-size:23px;letter-spacing:-.02em;display:flex;align-items:center;gap:9px}
    .brand .dot{width:11px;height:11px;border-radius:50%;background:var(--clay);display:inline-block}
    nav.links{margin-left:auto;display:flex;gap:30px;align-items:center;font-size:15px;font-weight:450;color:var(--ink-soft)}
    nav.links a:hover{color:var(--ink)}
    .btn{display:inline-flex;align-items:center;gap:9px;font-family:var(--sans);font-weight:550;font-size:15px;padding:11px 20px;border-radius:11px;cursor:pointer;transition:.18s;border:1px solid transparent;white-space:nowrap}
    .btn svg{width:17px;height:17px;fill:currentColor}
    .btn-primary{background:var(--clay);color:#fff;box-shadow:0 1px 2px rgba(160,67,39,.25)}
    .btn-primary:hover{background:var(--clay-ink);transform:translateY(-1px)}
    .btn-outline{background:var(--raised);color:var(--ink);border-color:var(--line)}
    .btn-outline:hover{border-color:var(--ink-faint)}
    .btn-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
    .btn-ghost:hover{background:var(--paper-2)}
    @media(max-width:820px){nav.links a:not(.navcta){display:none}}

    /* hero */
    .hero{padding:72px 0 40px;display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center}
    .hero .eyebrow{margin-bottom:22px}
    .hero h1{font-family:var(--serif);font-weight:500;font-size:60px;line-height:1.04;letter-spacing:-.025em;margin-bottom:22px}
    .hero h1 em{font-style:italic;color:var(--clay-ink)}
    .hero p.sub{font-size:19px;color:var(--ink-soft);max-width:30em;margin-bottom:30px}
    .hero .actions{display:flex;gap:13px;flex-wrap:wrap;align-items:center}
    .hero .note{margin-top:20px;font-size:14px;color:var(--ink-faint);display:flex;align-items:center;gap:8px}
    .hero .note b{color:var(--ink-soft);font-weight:550}

    /* product mockup */
    .mock{position:relative}
    .card{background:var(--raised);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow)}
    .mock .issue{padding:18px 20px;position:relative;z-index:2}
    .mock .win-dots{display:flex;gap:6px;margin-bottom:14px}
    .mock .win-dots i{width:10px;height:10px;border-radius:50%;background:var(--line);display:block}
    .mock .tag{display:inline-block;font-size:12px;font-weight:600;color:var(--ink-faint);margin-bottom:7px}
    .mock .issue h4{font-size:16px;font-weight:600;margin-bottom:5px}
    .mock .issue .body{font-size:13.5px;color:var(--ink-soft)}
    .mock .arrow{display:flex;justify-content:center;margin:-6px 0;position:relative;z-index:3}
    .mock .arrow span{background:var(--clay);color:#fff;font-size:12px;font-weight:600;padding:6px 13px;border-radius:20px;box-shadow:0 4px 14px rgba(160,67,39,.28);display:inline-flex;align-items:center;gap:7px}
    .mock .report{padding:18px 20px;margin-top:-4px}
    .mock .rrow{display:flex;align-items:center;gap:10px;margin-bottom:13px}
    .mock .sev{font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#a24327;background:#c9644215;border:1px solid #c9644230;padding:3px 9px;border-radius:6px}
    .mock .score{margin-left:auto;font-family:var(--serif);font-weight:600;font-size:15px}
    .mock .bar{height:6px;border-radius:4px;background:var(--line-soft);overflow:hidden;margin-bottom:14px}
    .mock .bar i{display:block;height:100%;width:92%;background:linear-gradient(90deg,#c96442,#5c6b52);border-radius:4px}
    .mock .rc{font-size:13px;color:var(--ink-soft);line-height:1.55;margin-bottom:14px}
    .mock .rc b{color:var(--ink);font-weight:600}
    .mock .pr{display:inline-flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--sage);background:#5c6b5214;border:1px solid #5c6b5230;padding:7px 13px;border-radius:9px}
    .mock .float{position:absolute;right:-14px;top:-16px;background:var(--raised);border:1px solid var(--line);border-radius:12px;padding:9px 13px;font-size:12.5px;font-weight:550;box-shadow:var(--shadow);display:flex;align-items:center;gap:8px}

    /* sections */
    section.band{padding:78px 0;border-top:1px solid var(--line-soft)}
    .sec-head{max-width:34em;margin-bottom:46px}
    .sec-head h2{font-family:var(--serif);font-weight:500;font-size:38px;line-height:1.1;letter-spacing:-.02em;margin:12px 0 0}
    .sec-head p{color:var(--ink-soft);margin-top:14px;font-size:17px}

    .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
    .steps .step{padding:26px 26px 26px 0;border-left:1px solid var(--line);padding-left:26px}
    .steps .step:first-child{border-left:none;padding-left:0}
    .steps .num{font-family:var(--serif);font-size:15px;color:var(--clay-ink);font-weight:600;margin-bottom:12px}
    .steps .step h3{font-size:17px;font-weight:600;margin-bottom:7px}
    .steps .step p{font-size:15px;color:var(--ink-soft)}

    .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}
    .tile{background:var(--paper-2);border:1px solid var(--line);border-radius:16px;padding:26px}
    .tile .ic{width:42px;height:42px;border-radius:11px;background:#c9644214;display:flex;align-items:center;justify-content:center;margin-bottom:16px}
    .tile .ic svg{width:21px;height:21px;fill:none;stroke:var(--clay);stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
    .tile h3{font-size:16px;font-weight:600;margin-bottom:6px}
    .tile p{font-size:14.5px;color:var(--ink-soft)}

    .chan{display:grid;grid-template-columns:1fr 1fr;gap:20px}
    .chan .box{background:var(--paper-2);border:1px solid var(--line);border-radius:18px;padding:30px}
    .chan .box .ic{margin-bottom:16px;height:34px;display:flex;align-items:center}
    .chan .box .ic svg{height:32px;width:auto}
    .chan .box h3{font-family:var(--serif);font-size:22px;font-weight:600;margin-bottom:8px}
    .chan .box p{font-size:15px;color:var(--ink-soft);margin-bottom:18px}
    .chan code{background:var(--paper);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:13px}

    /* closing cta */
    .cta{margin:78px 0;background:linear-gradient(160deg,#2c2620,#3a322a);color:#f6f2ea;border-radius:26px;padding:64px 40px;text-align:center;position:relative;overflow:hidden}
    .cta::after{content:"";position:absolute;right:-60px;bottom:-80px;width:280px;height:280px;background:radial-gradient(circle,rgba(201,100,66,.35),transparent 70%);pointer-events:none}
    .cta h2{font-family:var(--serif);font-weight:500;font-size:40px;line-height:1.08;letter-spacing:-.02em;margin-bottom:14px}
    .cta p{color:#d8cfc0;margin-bottom:28px;font-size:17px}
    .cta .actions{display:flex;gap:13px;justify-content:center;flex-wrap:wrap}
    .cta .btn-primary{background:var(--clay)}
    .cta .btn-ghost{background:transparent;border-color:#5a5147;color:#f6f2ea}
    .cta .btn-ghost:hover{background:rgba(255,255,255,.06)}

    footer{border-top:1px solid var(--line-soft);padding:34px 0 60px;color:var(--ink-faint);font-size:14px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}
    footer .brand{font-size:18px;color:var(--ink)}
    footer .sp{margin-left:auto}

    @media(max-width:900px){
      .hero{grid-template-columns:1fr;gap:44px;padding:48px 0 20px}
      .hero h1{font-size:44px}
      .steps,.grid3,.chan{grid-template-columns:1fr}
      .steps .step{border-left:none;padding-left:0;border-top:1px solid var(--line);padding-top:22px}
      .steps .step:first-child{border-top:none;padding-top:0}
      .sec-head h2,.cta h2{font-size:31px}
      .wrap{padding:0 22px}
    }
  </style>
</head>
<body>
  <header id="top">
    <div class="wrap bar">
      <a class="brand" href="#top"><span class="dot"></span>Sentifix</a>
      <nav class="links">
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#channels">Integrations</a>
        <a href="https://github.com/Akshat171/Sentifix" target="_blank" rel="noopener">GitHub</a>
        <a class="btn btn-primary navcta" href="${install}">Add to GitHub</a>
      </nav>
    </div>
  </header>

  <main class="wrap">
    <!-- HERO -->
    <section class="hero">
      <div>
        <div class="eyebrow">Open-source AI bug triage</div>
        <h1 class="serif">Your bug reports,<br>triaged into <em>pull requests</em>.</h1>
        <p class="sub">Sentifix reads every incoming GitHub issue, finds the root cause in your codebase, and opens a pull request with the fix — before an engineer even opens the tab.</p>
        <div class="actions">
          <a class="btn btn-primary" href="${install}">
            <svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Add to GitHub
          </a>
          <a class="btn btn-outline" href="https://github.com/Akshat171/Sentifix" target="_blank" rel="noopener">Star on GitHub ★</a>
        </div>
        <div class="note"><b>No infra, no config.</b> Install the app, pick your repos — you review and merge.</div>
      </div>

      <!-- product mockup -->
      <div class="mock">
        <div class="float"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c96442" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/></svg> <span>Triaged in ~30s</span></div>
        <div class="card issue">
          <div class="win-dots"><i></i><i></i><i></i></div>
          <div class="tag">ISSUE #128 · opened</div>
          <h4>Login fails silently on mobile Safari</h4>
          <div class="body">Tapping “Sign in” does nothing. No error shown. Works on desktop.</div>
        </div>
        <div class="arrow"><span>↓ Sentifix analyzing</span></div>
        <div class="card report">
          <div class="rrow">
            <span class="sev">● High · Auth</span>
            <span class="score">0.94</span>
          </div>
          <div class="bar"><i></i></div>
          <div class="rc"><b>Root cause:</b> the tap handler isn’t bound to <code style="font-size:12px">touchend</code>, so <code style="font-size:12px">onClick</code> never fires in mobile Safari’s auth flow.</div>
          <span class="pr"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/></svg> Pull request #129 opened →</span>
        </div>
      </div>
    </section>

    <!-- HOW -->
    <section class="band" id="how">
      <div class="sec-head">
        <div class="eyebrow">How it works</div>
        <h2 class="serif">From “it’s broken” to a reviewable diff.</h2>
        <p>Every issue runs through the same grounded pipeline — no guesswork, and a quality score before it reaches you.</p>
      </div>
      <div class="steps">
        <div class="step"><div class="num">01</div><h3>Understand</h3><p>Classifies severity and category, then retrieves the exact code involved with hybrid semantic + keyword search over your repo.</p></div>
        <div class="step"><div class="num">02</div><h3>Diagnose &amp; fix</h3><p>Reasons about the root cause and writes a minimal, multi-file unified diff grounded in your actual code.</p></div>
        <div class="step"><div class="num">03</div><h3>Score &amp; ship</h3><p>An LLM judge scores the fix, then Sentifix comments on the issue and opens a pull request for you to review.</p></div>
      </div>
    </section>

    <!-- FEATURES -->
    <section class="band" id="features">
      <div class="sec-head">
        <div class="eyebrow">What’s in the box</div>
        <h2 class="serif">Everything from issue to merge.</h2>
      </div>
      <div class="grid3">
        <div class="tile"><div class="ic"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg></div><h3>Grounded RAG</h3><p>Hybrid BM25 + vector search keeps every fix tied to your real code — not a hallucination.</p></div>
        <div class="tile"><div class="ic"><svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/></svg></div><h3>Automatic PRs</h3><p>Applies the diff to a fresh branch and opens a pull request you review like any other.</p></div>
        <div class="tile"><div class="ic"><svg viewBox="0 0 24 24"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg></div><h3>Scored by a judge</h3><p>Correctness, completeness, safety and clarity — rated before the fix reaches you.</p></div>
        <div class="tile"><div class="ic"><svg viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/></svg></div><h3>Multi-tenant &amp; private</h3><p>Per-installation isolation. Your code is scoped to your org, never shared across tenants.</p></div>
        <div class="tile"><div class="ic"><svg viewBox="0 0 24 24"><line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/></svg></div><h3>You stay in control</h3><p>Trigger on every issue, a label, or an explicit <code style="font-size:12px">/sentifix</code> — with a daily cap.</p></div>
        <div class="tile"><div class="ic"><svg viewBox="0 0 24 24"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg></div><h3>Open source</h3><p>MIT licensed. Self-host it, read every line, extend the pipeline to fit your stack.</p></div>
      </div>
    </section>

    <!-- CHANNELS -->
    <section class="band" id="channels">
      <div class="sec-head">
        <div class="eyebrow">Where it works</div>
        <h2 class="serif">Meets your team where bugs land.</h2>
      </div>
      <div class="chan">
        <div class="box">
          <div class="ic"><svg viewBox="0 0 16 16" style="fill:var(--ink);stroke:none"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></div>
          <h3>GitHub</h3>
          <p>Open an issue, or comment <code>/sentifix</code> on any existing one. The triage and a ready-to-review pull request land right on the issue.</p>
          <a class="btn btn-primary" href="${install}">Add to GitHub</a>
        </div>
        <div class="box">
          <div class="ic"><svg viewBox="0 0 122.8 122.8" style="stroke:none"><path d="M25.8 77.6c0 7.1-5.8 12.9-12.9 12.9S0 84.7 0 77.6s5.8-12.9 12.9-12.9h12.9v12.9z" fill="#e01e5a"/><path d="M32.3 77.6c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9v32.3c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V77.6z" fill="#e01e5a"/><path d="M45.2 25.8c-7.1 0-12.9-5.8-12.9-12.9S38.1 0 45.2 0s12.9 5.8 12.9 12.9v12.9H45.2z" fill="#36c5f0"/><path d="M45.2 32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H12.9C5.8 58.1 0 52.3 0 45.2s5.8-12.9 12.9-12.9h32.3z" fill="#36c5f0"/><path d="M97 45.2c0-7.1 5.8-12.9 12.9-12.9s12.9 5.8 12.9 12.9-5.8 12.9-12.9 12.9H97V45.2z" fill="#2eb67d"/><path d="M90.5 45.2c0 7.1-5.8 12.9-12.9 12.9s-12.9-5.8-12.9-12.9V12.9C64.7 5.8 70.5 0 77.6 0s12.9 5.8 12.9 12.9v32.3z" fill="#2eb67d"/><path d="M77.6 97c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9-12.9-5.8-12.9-12.9V97h12.9z" fill="#ecb22e"/><path d="M77.6 90.5c-7.1 0-12.9-5.8-12.9-12.9s5.8-12.9 12.9-12.9h32.3c7.1 0 12.9 5.8 12.9 12.9s-5.8 12.9-12.9 12.9H77.6z" fill="#ecb22e"/></svg></div>
          <h3>Slack</h3>
          <p>Tag <strong>@Sentifix</strong> in any channel with an error or stack trace. It replies in-thread with the root cause, a diff preview, and a link to the PR.</p>
          <a class="btn btn-ghost" href="/slack/install">Add to Slack</a>
        </div>
      </div>
    </section>

    <!-- CLOSING CTA -->
    <section class="cta">
      <h2 class="serif">Stop triaging. Start merging.</h2>
      <p>Free and open source. Install the app, point it at a repo, and let the pull requests come to you.</p>
      <div class="actions">
        <a class="btn btn-primary" href="${install}">Add to GitHub</a>
        <a class="btn btn-ghost" href="https://github.com/Akshat171/Sentifix" target="_blank" rel="noopener">Read the docs</a>
      </div>
    </section>
  </main>

  <footer class="wrap">
    <span class="brand"><span class="dot" style="width:9px;height:9px;background:var(--clay);border-radius:50%;display:inline-block;margin-right:7px"></span>Sentifix</span>
    <span>MIT licensed · Built with NestJS, LangGraph &amp; pgvector</span>
    <span class="sp"></span>
    <a href="https://github.com/Akshat171/Sentifix" target="_blank" rel="noopener">GitHub</a>
    <a href="/dashboard">Dashboard</a>
  </footer>

  <script>
    // subtle nav border once scrolled
    const h=document.querySelector('header');
    addEventListener('scroll',()=>h.style.borderBottomColor=scrollY>8?'var(--line)':'transparent',{passive:true});
  </script>
</body>
</html>`;
  }
}
