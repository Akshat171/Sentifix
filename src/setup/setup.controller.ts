import { Controller, Get, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { HttpReply, HttpRequest } from '../auth/http.types';
import { In, Repository } from 'typeorm';
import { SessionService } from '../auth/session.service';
import { Installation } from '../persistence/entities/installation.entity';
import { GITHUB_ICON, SLACK_ICON, page } from '../ui/theme';

@Controller('setup')
export class SetupController {
  private readonly appSlug: string;
  private readonly authEnabled: boolean;
  /** Mirrors SlackOAuthService.configured — both halves of the OAuth pair must be present. */
  private readonly slackEnabled: boolean;

  constructor(
    config: ConfigService,
    private readonly session: SessionService,
    @InjectRepository(Installation) private readonly installationRepo: Repository<Installation>,
  ) {
    this.appSlug = config.get<string>('GITHUB_APP_SLUG') ?? '';
    this.authEnabled = config.get<boolean>('DASHBOARD_AUTH') === true;
    this.slackEnabled = !!(
      config.get<string>('SLACK_CLIENT_ID') && config.get<string>('SLACK_CLIENT_SECRET')
    );
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

    const steps: Array<[string, string]> = [
      ['Install', 'Choose which repositories Sentifix is allowed to see.'],
      [
        'Sentifix indexes your code',
        'It reads the files and builds a searchable index so it can find the right code later.',
      ],
      [
        'Open an issue',
        'It classifies the report, locates the relevant code, works out the root cause, and proposes a fix.',
      ],
      [
        'Approve the fix',
        'Review the diff on the <a href="/dashboard">dashboard</a>; approving opens a branch and a pull request.',
      ],
    ];

    const html = page({
      title: 'Sentifix — setup',
      head: `<style>
body{display:flex;flex-direction:column;align-items:center;padding:48px 20px}
.panel{width:100%;max-width:620px;display:flex;flex-direction:column;gap:32px}
.head{display:flex;flex-direction:column;gap:14px;align-items:flex-start}
.head h1{font-size:clamp(1.9rem,5vw,2.5rem)}
.disabled{display:inline-flex;padding:13px 22px;border-radius:8px;background:var(--sunk);border:1px solid var(--line);color:var(--muted);font-size:.9375rem;font-weight:600}
.actions{display:flex;flex-wrap:wrap;gap:12px}
.hint{font-size:.875rem;color:var(--muted)}
.hint code{font-size:.8125rem;background:var(--sunk);border:1px solid var(--line);padding:1px 6px;border-radius:4px}
.block{display:flex;flex-direction:column;gap:12px}
.repo{display:flex;align-items:center;gap:10px;padding:11px 14px;background:var(--surface);border:1px solid var(--line);border-radius:8px;font-family:var(--mono);font-size:.8125rem}
.repo-dot{width:7px;height:7px;border-radius:50%;background:var(--add);flex:none}
.empty{padding:16px;background:var(--sunk);border:1px solid var(--line);border-radius:8px;color:var(--muted);font-size:.9375rem}
.steps{display:flex;flex-direction:column;gap:2px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden}
.step{display:flex;gap:14px;padding:18px 20px;background:var(--surface)}
.step-n{font-family:var(--mono);font-size:.6875rem;font-weight:700;color:var(--accent-text);padding-top:3px;flex:none}
.step-b strong{display:block;font-size:.9375rem;margin-bottom:2px}
.step-b span{font-size:.875rem;color:var(--muted)}
.step-b a{color:var(--accent-text)}
.foot{font-size:.875rem;color:var(--muted)}
.foot a{color:var(--accent-text)}
</style>`,
      body: `
<div class="panel">
  <div class="head">
    <a class="brand" href="/"><span class="brand-dot" aria-hidden="true"></span>Sentifix</a>
    <h1>Connect a repository.</h1>
    <p class="lede">Install the GitHub App and Sentifix starts triaging new issues — root cause and a proposed patch, usually within 30 seconds.</p>
    <div class="actions">
      ${
        installUrl
          ? `<a class="btn btn-primary" href="${installUrl}">${GITHUB_ICON} Install on GitHub</a>`
          : `<div class="disabled">Set GITHUB_APP_SLUG in .env to enable</div>`
      }
      ${
        this.slackEnabled
          ? `<a class="btn btn-outline" href="/slack/install">${SLACK_ICON} Add to Slack</a>`
          : ''
      }
    </div>
    ${
      this.slackEnabled
        ? `<p class="hint">Optional — once added, anyone can report a bug by mentioning <code>@sentifix</code> in a channel, and the triage comes back in the thread.</p>`
        : ''
    }
  </div>

  <div class="block">
    <span class="label">Connected repositories (${repoList.length})</span>
    ${
      repoList.length
        ? repoList.map((r) => `<div class="repo"><span class="repo-dot"></span>${r}</div>`).join('')
        : '<div class="empty">No repositories connected yet. Install the app to get started.</div>'
    }
  </div>

  <div class="block">
    <span class="label">What happens next</span>
    <div class="steps">
      ${steps
        .map(
          ([title, body], i) =>
            `<div class="step"><span class="step-n">0${i + 1}</span><div class="step-b"><strong>${title}</strong><span>${body}</span></div></div>`,
        )
        .join('')}
    </div>
  </div>

  <p class="foot">Already installed? Head to the <a href="/dashboard">dashboard</a>.</p>
</div>`,
    });

    reply.type('text/html; charset=utf-8').send(html);
  }
}
