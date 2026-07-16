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
  <title>Sentifix — from bug report to fix, automatically</title>
  <meta name="description" content="Open-source AI agent that triages GitHub bug reports, diagnoses root causes, and opens pull requests with proposed fixes — automatically.">
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0d1117;--card:#161b22;--border:#30363d;--text:#e6edf3;--muted:#8b949e;--accent:#58a6ff;--green:#2ea043}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--text);line-height:1.6;-webkit-font-smoothing:antialiased}
    a{color:var(--accent);text-decoration:none}
    .wrap{max-width:960px;margin:0 auto;padding:0 24px}
    header{border-bottom:1px solid var(--border);padding:18px 0;position:sticky;top:0;background:rgba(13,17,23,.85);backdrop-filter:blur(8px);z-index:10}
    header .wrap{display:flex;align-items:center;gap:10px}
    .logo{font-size:22px;font-weight:700;color:#f0f6fc;display:flex;align-items:center;gap:8px}
    .nav{margin-left:auto;display:flex;gap:20px;align-items:center;font-size:14px}
    .nav a{color:var(--muted)}.nav a:hover{color:var(--text)}
    .btn{display:inline-flex;align-items:center;gap:8px;font-weight:600;font-size:15px;padding:12px 22px;border-radius:8px;transition:.15s;cursor:pointer;border:1px solid transparent}
    .btn-primary{background:var(--green);color:#fff;border-color:#3fb950}
    .btn-primary:hover{background:#3fb950;color:#fff}
    .btn-ghost{background:#21262d;color:var(--text);border-color:var(--border)}
    .btn-ghost:hover{background:#30363d}
    .btn svg{width:18px;height:18px;fill:currentColor}
    .hero{text-align:center;padding:90px 0 70px}
    .eyebrow{display:inline-block;font-size:13px;font-weight:600;color:var(--accent);background:#1f6feb22;border:1px solid #1f6feb44;padding:5px 14px;border-radius:20px;margin-bottom:24px}
    .hero h1{font-size:52px;line-height:1.1;font-weight:800;color:#f0f6fc;letter-spacing:-1.5px;margin-bottom:20px}
    .hero h1 .grad{background:linear-gradient(90deg,#58a6ff,#3fb950);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
    .hero p{font-size:19px;color:var(--muted);max-width:620px;margin:0 auto 34px}
    .cta{display:flex;gap:14px;justify-content:center;flex-wrap:wrap}
    .subnote{margin-top:18px;font-size:13px;color:#6e7681}
    .section{padding:56px 0;border-top:1px solid var(--border)}
    .section h2{font-size:14px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);text-align:center;margin-bottom:8px}
    .section .lead{font-size:26px;font-weight:700;color:#f0f6fc;text-align:center;margin-bottom:40px;letter-spacing:-.5px}
    .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
    .step{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:22px}
    .step .n{width:30px;height:30px;border-radius:8px;background:#1f6feb22;color:var(--accent);font-weight:700;display:flex;align-items:center;justify-content:center;margin-bottom:12px}
    .step h3{font-size:15px;color:#f0f6fc;margin-bottom:6px}
    .step p{font-size:14px;color:var(--muted)}
    .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
    .feat{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px}
    .feat .ico{font-size:22px;margin-bottom:10px}
    .feat h3{font-size:15px;color:#f0f6fc;margin-bottom:6px}
    .feat p{font-size:13px;color:var(--muted)}
    .pipeline{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:22px;font-family:'SFMono-Regular',Consolas,monospace;font-size:13px;color:var(--muted);overflow-x:auto;white-space:pre;line-height:1.9}
    .cta-final{text-align:center;padding:80px 0}
    .cta-final h2{font-size:34px;font-weight:800;color:#f0f6fc;letter-spacing:-1px;margin-bottom:14px;text-transform:none}
    .cta-final p{color:var(--muted);margin-bottom:28px}
    footer{border-top:1px solid var(--border);padding:32px 0;color:#6e7681;font-size:13px;text-align:center}
    @media(max-width:720px){.hero h1{font-size:36px}.steps,.grid{grid-template-columns:1fr}.hero{padding:60px 0 40px}}
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <div class="logo">🩹 Sentifix</div>
      <nav class="nav">
        <a href="#how">How it works</a>
        <a href="#features">Features</a>
        <a href="#channels">Integrations</a>
        <a href="https://github.com/Akshat171/Sentifix" target="_blank">GitHub</a>
        <a href="/dashboard">Dashboard</a>
      </nav>
    </div>
  </header>

  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">Open source · MIT licensed</span>
      <h1>From bug report to <span class="grad">fix, automatically</span></h1>
      <p>Sentifix is an AI agent that reads every incoming GitHub issue, finds the root cause in your code, and opens a pull request with the fix — before an engineer even looks.</p>
      <div class="cta">
        <a class="btn btn-primary" href="${install}">
          <svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 014 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
          Add to GitHub
        </a>
        <a class="btn btn-ghost" href="https://github.com/Akshat171/Sentifix" target="_blank">Star on GitHub ★</a>
      </div>
      <div class="subnote">Install the app, pick your repos — no infra, no config. You review and merge.</div>
    </div>
  </section>

  <section class="section" id="how">
    <div class="wrap">
      <h2>How it works</h2>
      <div class="lead">Six steps. Zero human wait time.</div>
      <div class="pipeline">GitHub issue / Slack mention
   │
   ▼
Classify  →  Retrieve code (hybrid RAG)  →  Diagnose root cause
   │
   ▼
Propose fix (unified diff)  →  LLM-as-judge score  →  Comment + open PR</div>
    </div>
  </section>

  <section class="section" id="features">
    <div class="wrap">
      <h2>What's in the box</h2>
      <div class="lead">Everything needed to go from issue to merge.</div>
      <div class="grid">
        <div class="feat"><div class="ico">🤖</div><h3>Auto-triage</h3><p>Classifies severity, category, and affected components in seconds.</p></div>
        <div class="feat"><div class="ico">🧠</div><h3>RAG over your code</h3><p>Hybrid BM25 + vector search grounds every fix in your actual repo.</p></div>
        <div class="feat"><div class="ico">🔀</div><h3>Auto pull request</h3><p>Applies the diff to a branch and opens a PR for you to review.</p></div>
        <div class="feat"><div class="ico">⚖️</div><h3>LLM-as-judge</h3><p>Every proposed fix is scored for correctness, safety, and clarity.</p></div>
        <div class="feat"><div class="ico">💬</div><h3>GitHub &amp; Slack</h3><p>Triage from a new issue, a /sentifix comment, or an @mention.</p></div>
        <div class="feat"><div class="ico">🔒</div><h3>Multi-tenant &amp; secure</h3><p>Per-installation isolation; your code stays scoped to your org.</p></div>
      </div>
    </div>
  </section>

  <section class="section" id="channels">
    <div class="wrap">
      <h2>Where it works</h2>
      <div class="lead">Triage from wherever bugs get reported.</div>
      <div class="grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="feat">
          <div class="ico">🐙</div>
          <h3>GitHub</h3>
          <p>Open an issue — or comment <code style="background:#0d1117;padding:1px 6px;border-radius:4px">/sentifix</code> on any issue. Sentifix triages it and opens a pull request with the proposed fix, right on the issue.</p>
        </div>
        <div class="feat">
          <div class="ico">💬</div>
          <h3>Slack</h3>
          <p>Tag <strong>@Sentifix</strong> in any channel with an error or stack trace. It replies in-thread with the severity, root cause, a diff preview, and a link to the PR — no context-switch to GitHub.</p>
        </div>
      </div>
    </div>
  </section>

  <section class="cta-final">
    <div class="wrap">
      <h2>Stop triaging. Start merging.</h2>
      <p>Free and open source. Install the GitHub App and point it at a repo.</p>
      <div class="cta">
        <a class="btn btn-primary" href="${install}">Add to GitHub</a>
        <a class="btn btn-ghost" href="/setup">Setup &amp; connected repos</a>
      </div>
    </div>
  </section>

  <footer>
    <div class="wrap">
      MIT licensed · Built with NestJS, LangGraph &amp; pgvector ·
      <a href="https://github.com/Akshat171/Sentifix" target="_blank">github.com/Akshat171/Sentifix</a>
    </div>
  </footer>
</body>
</html>`;
  }
}
