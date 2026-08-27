import { Controller, Header, Req, Sse, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Observable, filter, from, interval, map, merge, mergeMap, startWith } from 'rxjs';
import { SessionGuard } from '../auth/session.guard';
import type { SessionPayload } from '../auth/session.service';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { RunEventsService } from './run-events.service';

interface Nudge {
  data: { type: 'runs-changed' | 'ping' };
}

/** Under nginx's 60s proxy_read_timeout anything quieter than this looks dead. */
const HEARTBEAT_MS = 20_000;

/**
 * Live updates for the dashboard.
 *
 * The stream carries a nudge and nothing else: the client re-fetches the same
 * lean list endpoint it already polls. That keeps one render path, keeps run
 * data off the stream entirely, and means a dropped connection degrades to
 * polling rather than to a stale screen.
 *
 * SSE rather than WebSockets because the browser only needs to listen. It is
 * plain HTTP, EventSource reconnects on its own, and it needs no new dependency.
 */
@Controller('events')
@UseGuards(SessionGuard)
export class EventsController {
  constructor(
    private readonly runEvents: RunEventsService,
    @InjectRepository(InstallationRepository)
    private readonly repoMap: Repository<InstallationRepository>,
  ) {}

  // nginx and most reverse proxies buffer proxied responses by default, which
  // holds events back until a buffer fills — fatal for a stream. This header
  // turns that off per response, so a self-hosted deploy behind an unmodified
  // proxy works without anyone editing a config file.
  @Header('X-Accel-Buffering', 'no')
  @Sse('runs')
  runs(@Req() req: { session?: SessionPayload }): Observable<Nudge> {
    const session = req.session;
    const scope = !session || session.superuser ? undefined : (session.installationIds ?? []);

    const nudges = this.runEvents.stream().pipe(
      mergeMap((event) => from(this.visibleTo(event.repoFullName, scope))),
      filter(Boolean),
      map((): Nudge => ({ data: { type: 'runs-changed' } })),
    );

    // The heartbeat is what stops a proxy from reaping an idle connection, and
    // startWith gives the client an immediate frame so it knows the stream is live.
    const heartbeat = interval(HEARTBEAT_MS).pipe(
      startWith(0),
      map((): Nudge => ({ data: { type: 'ping' } })),
    );

    return merge(nudges, heartbeat);
  }

  /**
   * Whether this session may know that this repo changed.
   *
   * Timing alone leaks information, so the check happens before the nudge is
   * sent rather than being left to the client. One indexed lookup per event,
   * and events are a handful per triage run.
   */
  private async visibleTo(repoFullName: string | null, scope?: number[]): Promise<boolean> {
    if (scope === undefined) return true; // operator or open self-host
    if (!repoFullName || scope.length === 0) return false;

    const row = await this.repoMap.findOne({ where: { repoFullName } });
    // An unmapped repo belongs to nobody, matching how reposForScope filters.
    return row ? scope.includes(row.installationId) : false;
  }
}
