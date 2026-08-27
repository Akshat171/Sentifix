import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { Observable, Subject } from 'rxjs';

/** A repo's triage state changed. Deliberately carries no run data — see EventsController. */
export interface RunEvent {
  repoFullName: string | null;
}

const CHANNEL = 'sentifix:runs';

/**
 * Fan-out for "something changed" nudges.
 *
 * Triage runs in the queue consumer, but the browser is attached to whichever
 * app instance served its request. With one instance those are the same process
 * and an in-memory Subject is enough; with two, the tab waits forever for an
 * event raised somewhere else. So when REDIS_URL is set the nudge goes through
 * Redis pub/sub and every instance hears it, including the one that published.
 *
 * Redis being down must never break triage or the dashboard: publishing falls
 * back to the local Subject, and the UI keeps its polling loop underneath.
 */
@Injectable()
export class RunEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RunEventsService.name);
  private readonly events = new Subject<RunEvent>();
  private readonly url?: string;
  private publisher?: Redis;
  private subscriber?: Redis;

  constructor(config: ConfigService) {
    this.url = config.get<string>('REDIS_URL');
  }

  onModuleInit(): void {
    if (!this.url) {
      this.logger.log('REDIS_URL unset — live updates stay in-process (single instance only)');
      return;
    }

    // lazyConnect keeps a missing Redis from failing boot; the retry policy is
    // capped so a long outage does not turn into a reconnect storm.
    const opts = {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      retryStrategy: (times: number) => Math.min(times * 500, 10_000),
    };

    this.publisher = new Redis(this.url, opts);
    this.subscriber = new Redis(this.url, opts);

    for (const [name, client] of [
      ['publisher', this.publisher],
      ['subscriber', this.subscriber],
    ] as const) {
      client.on('error', (err: Error) => {
        this.logger.warn(`Redis ${name} error, live updates degraded: ${err.message}`);
      });
    }

    void this.subscriber
      .connect()
      .then(() => this.subscriber?.subscribe(CHANNEL))
      .then(() => {
        this.subscriber?.on('message', (_channel, payload) => {
          try {
            this.events.next(JSON.parse(payload) as RunEvent);
          } catch {
            this.logger.warn('Ignoring malformed run event');
          }
        });
        this.logger.log('Live updates fanning out over Redis');
      })
      .catch((err: Error) => this.logger.warn(`Redis subscribe failed: ${err.message}`));

    void this.publisher.connect().catch(() => undefined);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([this.publisher?.quit(), this.subscriber?.quit()]);
  }

  /** Never throws and never awaits the network — callers are on the triage path. */
  publish(repoFullName: string | null): void {
    const event: RunEvent = { repoFullName };

    if (!this.publisher || this.publisher.status !== 'ready') {
      this.events.next(event);
      return;
    }

    this.publisher.publish(CHANNEL, JSON.stringify(event)).catch((err: Error) => {
      this.logger.warn(`Run event publish failed, falling back to local: ${err.message}`);
      this.events.next(event);
    });
  }

  stream(): Observable<RunEvent> {
    return this.events.asObservable();
  }
}
