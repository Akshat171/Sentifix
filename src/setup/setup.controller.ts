import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { In, Repository } from 'typeorm';
import { SessionService } from '../auth/session.service';
import { Installation } from '../persistence/entities/installation.entity';

@Controller('setup')
export class SetupController {
  private readonly appSlug: string;
  private readonly authEnabled: boolean;

  constructor(
    config: ConfigService,
    private readonly session: SessionService,
    @InjectRepository(Installation) private readonly installationRepo: Repository<Installation>,
  ) {
    this.appSlug = config.get<string>('GITHUB_APP_SLUG') ?? '';
    this.authEnabled = config.get<boolean>('DASHBOARD_AUTH') === true;
  }

  @Get()
  async serve(@Req() req: HttpRequest, @Res() reply: HttpReply): Promise<void> {
    // In multi-tenant mode, require login and show only the user's installations
    let installations: Installation[];
    if (this.authEnabled) {
      const sess = this.session.getSession(req);
      if (!sess) {
        reply.code(302).redirect('/auth/login');
        return;
      }
      installations = sess.superuser
        ? await this.installationRepo.find({ order: { createdAt: 'DESC' } })
        : sess.installationIds.length
          ? await this.installationRepo.find({
              where: { installationId: In(sess.installationIds) },
              order: { createdAt: 'DESC' },
            })
          : [];
    } else {
      installations = await this.installationRepo.find({ order: { createdAt: 'DESC' } });
    }

    const installUrl = this.appSlug
      ? `https://github.com/apps/${this.appSlug}/installations/new`
      : null;

    const repoList = installations.flatMap((i) => i.repos ?? []);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sentifix — Setup</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px}
    .card{background:#161b22;border:1px solid #30363d;border-radius:12px;padding:48px;max-width:560px;width:100%;text-align:center}
    .logo{font-size:48px;margin-bottom:16px}
    h1{font-size:28px;font-weight:700;color:#f0f6fc;margin-bottom:8px}
    .tagline{color:#8b949e;font-size:15px;line-height:1.5;margin-bottom:32px}
    .install-btn{display:inline-flex;align-items:center;gap:10px;background:#238636;border:1px solid #2ea043;color:#fff;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;transition:background .15s}
    .install-btn:hover{background:#2ea043}
    .install-btn svg{width:20px;height:20px;fill:currentColor}
    .disabled-btn{background:#21262d;border:1px solid #30363d;color:#6e7681;padding:14px 28px;border-radius:8px;font-size:15px;font-weight:600;cursor:not-allowed}
    .divider{border:none;border-top:1px solid #30363d;margin:32px 0}
    .section-title{font-size:12px;font-weight:600;color:#8b949e;text-transform:uppercase;letter-spacing:.5px;margin-bottom:16px;text-align:left}
    .repo-list{text-align:left}
    .repo-item{display:flex;align-items:center;gap:10px;padding:10px 14px;background:#0d1117;border-radius:6px;margin-bottom:8px;font-size:14px;color:#c9d1d9}
    .repo-dot{width:8px;height:8px;border-radius:50%;background:#2ea043;flex-shrink:0}
    .empty-state{color:#6e7681;font-size:14px;text-align:left;padding:16px;background:#0d1117;border-radius:6px}
    .steps{text-align:left;margin-top:32px}
    .step{display:flex;gap:12px;margin-bottom:16px}
    .step-num{width:24px;height:24px;border-radius:50%;background:#1f6feb;color:#fff;font-size:12px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
    .step-text{font-size:14px;color:#8b949e;line-height:1.5}
    .step-text strong{color:#c9d1d9}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🩹</div>
    <h1>Sentifix</h1>
    <p class="tagline">AI-powered bug triage. Opens an issue → gets a root cause, proposed fix, and pull request in ~30 seconds.</p>

    ${
      installUrl
        ? `<a class="install-btn" href="${installUrl}">
            <svg viewBox="0 0 16 16"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
            Install on GitHub
          </a>`
        : `<div class="disabled-btn">Set GITHUB_APP_SLUG in .env to enable</div>`
    }

    <hr class="divider">

    <div class="section-title">Connected repositories (${repoList.length})</div>
    <div class="repo-list">
      ${
        repoList.length
          ? repoList.map((r) => `<div class="repo-item"><div class="repo-dot"></div>${r}</div>`).join('')
          : '<div class="empty-state">No repositories connected yet. Install the app to get started.</div>'
      }
    </div>

    <div class="steps">
      <div class="section-title" style="margin-top:24px">How it works</div>
      <div class="step">
        <div class="step-num">1</div>
        <div class="step-text"><strong>Install</strong> — Click "Install on GitHub", select your repos</div>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <div class="step-text"><strong>Sentifix indexes your code</strong> — Reads files, creates embeddings for semantic search</div>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <div class="step-text"><strong>Open an issue</strong> — Sentifix classifies it, finds relevant code, diagnoses the root cause, and proposes a fix</div>
      </div>
      <div class="step">
        <div class="step-num">4</div>
        <div class="step-text"><strong>One-click PR</strong> — Approve the fix from the <a href="/dashboard" style="color:#58a6ff">dashboard</a> to auto-create a branch and PR</div>
      </div>
    </div>
  </div>
</body>
</html>`;

    reply.type('text/html; charset=utf-8').send(html);
  }
}
