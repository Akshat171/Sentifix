import { Controller, Get, Query, Res } from '@nestjs/common';
import type { HttpReply } from '../auth/http.types';
import { BRAND_MARK, page } from '../ui/theme';

/**
 * Where someone lands when they sign in but are not allowed in yet.
 *
 * Deliberately not an error page. Whoever reaches it followed a link a person
 * gave them and did nothing wrong, so it tells them exactly what happened, that
 * their request was recorded, and what happens next — rather than a bare 403
 * that reads like a bug and generates a support message.
 */
@Controller('access')
export class AccessController {
  @Get()
  serve(@Query('status') status: string, @Res() reply: HttpReply): void {
    const denied = status === 'denied';

    reply.type('text/html; charset=utf-8').send(
      page({
        title: denied ? 'Sentifix — access declined' : 'Sentifix — access pending',
        head: `<style>
body{display:grid;place-items:center;min-height:100vh}
.box{max-width:460px;padding:40px 24px;text-align:center}
.mark{width:48px;height:48px;border-radius:11px;margin:0 auto 22px;display:block}
h1{font-size:1.4rem;letter-spacing:-.02em;margin-bottom:12px}
p{color:var(--muted);margin-bottom:14px;font-size:.95rem}
.pill{display:inline-flex;align-items:center;gap:7px;font-family:var(--mono);font-size:.6875rem;font-weight:700;
  letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:6px;margin-bottom:20px}
.pill::before{content:"";width:7px;height:7px;border-radius:50%}
.wait{color:var(--sev-medium);background:var(--sunk)}
.wait::before{background:var(--sev-medium)}
.no{color:var(--del);background:var(--del-wash)}
.no::before{background:var(--del);border-radius:1px}
.foot{margin-top:26px;font-size:.8125rem}
.foot a{color:var(--accent-text)}
</style>`,
        body: `
<div class="box">
  ${BRAND_MARK.replace('class="brand-mark"', 'class="mark"')}
  ${
    denied
      ? `<span class="pill no">Access declined</span>
         <h1>This account can't use Sentifix</h1>
         <p>Your GitHub account isn't approved for this instance. If you think that's a
            mistake, reply to whoever shared the link with you.</p>`
      : `<span class="pill wait">Awaiting approval</span>
         <h1>Your request has been recorded</h1>
         <p>Sentifix is invite-only right now. We've logged your GitHub account and the
            owner of this instance will review it.</p>
         <p>You'll be able to sign in normally once you're approved — nothing else is
            needed from you.</p>`
  }
  <p class="foot"><a href="/auth/logout">Sign out</a> · <a href="/">Back to sentifix.dev</a></p>
</div>`,
      }),
    );
  }
}
