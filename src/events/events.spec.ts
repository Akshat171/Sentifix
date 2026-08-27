import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { firstValueFrom, filter, take, toArray } from 'rxjs';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { EventsController } from './events.controller';
import { RunEventsService } from './run-events.service';

const cfg = (v: Record<string, unknown> = {}) =>
  ({ get: (k: string) => v[k] }) as unknown as ConfigService;

function setup(mapRow: { installationId: number } | null) {
  const runEvents = new RunEventsService(cfg({}));
  runEvents.onModuleInit(); // no REDIS_URL → in-process Subject
  const repoMap = {
    findOne: jest.fn().mockResolvedValue(mapRow),
  } as unknown as Repository<InstallationRepository>;
  return { runEvents, controller: new EventsController(runEvents, repoMap), repoMap };
}

const req = (session?: { login: string; installationIds: number[]; superuser?: boolean }) =>
  ({ session: session as never }) as { session?: never };

/** Collect nudges (ignoring heartbeats) for a moment, then resolve. */
async function nudgesFrom(
  stream: ReturnType<EventsController['runs']>,
  emit: () => void,
  expected = 1,
) {
  const collected = firstValueFrom(
    stream.pipe(
      filter((n) => n.data.type === 'runs-changed'),
      take(expected),
      toArray(),
    ),
  );
  await new Promise((r) => setTimeout(r, 5)); // let the subscription attach
  emit();
  return collected;
}

describe('the stream carries a nudge, not data', () => {
  it('emits runs-changed with no run detail in it', async () => {
    const { runEvents, controller } = setup({ installationId: 7 });

    const [nudge] = await nudgesFrom(
      controller.runs(req({ login: 'me', installationIds: [7] })),
      () => runEvents.publish('acme/checkout'),
    );

    expect(nudge).toEqual({ data: { type: 'runs-changed' } });
    // Not even the repo name goes over the wire.
    expect(JSON.stringify(nudge)).not.toContain('acme');
  });

  it('opens with a ping so the client knows the stream is live', async () => {
    const { controller } = setup({ installationId: 7 });

    const first = await firstValueFrom(controller.runs(req({ login: 'me', installationIds: [7] })));
    expect(first.data.type).toBe('ping');
  });
});

describe('a nudge never crosses a tenant boundary', () => {
  it('is withheld when the repo belongs to another installation', async () => {
    const { runEvents, controller } = setup({ installationId: 999 });
    let seen = 0;

    const sub = controller
      .runs(req({ login: 'me', installationIds: [7] }))
      .pipe(filter((n) => n.data.type === 'runs-changed'))
      .subscribe(() => seen++);

    runEvents.publish('someone-else/private');
    await new Promise((r) => setTimeout(r, 30));
    sub.unsubscribe();

    // Even the timing of a nudge would say "something happened over there".
    expect(seen).toBe(0);
  });

  it('is withheld for an unmapped repo, which belongs to nobody', async () => {
    const { runEvents, controller } = setup(null);
    let seen = 0;

    const sub = controller
      .runs(req({ login: 'me', installationIds: [7] }))
      .pipe(filter((n) => n.data.type === 'runs-changed'))
      .subscribe(() => seen++);

    runEvents.publish('unmapped/repo');
    await new Promise((r) => setTimeout(r, 30));
    sub.unsubscribe();

    expect(seen).toBe(0);
  });

  it('reaches the operator, who is unrestricted', async () => {
    const { runEvents, controller } = setup(null);

    const [nudge] = await nudgesFrom(
      controller.runs(req({ login: 'op', installationIds: [], superuser: true })),
      () => runEvents.publish('anyones/repo'),
    );

    expect(nudge.data.type).toBe('runs-changed');
  });

  it('reaches a session whose installation owns the repo', async () => {
    const { runEvents, controller } = setup({ installationId: 7 });

    const [nudge] = await nudgesFrom(
      controller.runs(req({ login: 'me', installationIds: [7] })),
      () => runEvents.publish('acme/checkout'),
    );

    expect(nudge.data.type).toBe('runs-changed');
  });
});

describe('publishing is safe on the triage path', () => {
  it('delivers in-process when REDIS_URL is unset', async () => {
    const svc = new RunEventsService(cfg({}));
    svc.onModuleInit();

    const got = firstValueFrom(svc.stream());
    svc.publish('acme/checkout');

    await expect(got).resolves.toEqual({ repoFullName: 'acme/checkout' });
  });

  it('never throws when Redis is unreachable', () => {
    const svc = new RunEventsService(cfg({ REDIS_URL: 'redis://127.0.0.1:1' }));
    svc.onModuleInit();

    // A triage run must not fail because the nudge could not be sent.
    expect(() => svc.publish('acme/checkout')).not.toThrow();

    return svc.onModuleDestroy();
  });

  it('falls back to local delivery while Redis is down', async () => {
    const svc = new RunEventsService(cfg({ REDIS_URL: 'redis://127.0.0.1:1' }));
    svc.onModuleInit();

    const got = firstValueFrom(svc.stream());
    svc.publish('acme/checkout'); // publisher is not 'ready' → local Subject

    await expect(got).resolves.toEqual({ repoFullName: 'acme/checkout' });
    return svc.onModuleDestroy();
  });
});
