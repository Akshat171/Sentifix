jest.mock('@octokit/auth-app', () => ({ createAppAuth: jest.fn() }));
jest.mock('@octokit/rest', () => ({ Octokit: class {} }));

import { RmqContext } from '@nestjs/microservices';
import { TriageService } from '../triage/triage.service';
import { QueueConsumer } from './queue.consumer';
import { TriageJobPayload } from './queue.producer';

const job: TriageJobPayload = {
  issueId: 'i1',
  githubRepoId: '77',
  githubIssueNumber: 5,
  repoFullName: 'acme/checkout',
};

function harness(orchestrate: jest.Mock) {
  const message = { fields: { deliveryTag: 1 } };
  const channel = { ack: jest.fn(), nack: jest.fn() };
  const context = {
    getChannelRef: () => channel,
    getMessage: () => message,
  } as unknown as RmqContext;

  const consumer = new QueueConsumer({ orchestrate } as unknown as TriageService);
  return { consumer, channel, message, context };
}

describe('acking the triage message', () => {
  it('acks after a successful triage', async () => {
    const h = harness(jest.fn().mockResolvedValue(undefined));

    await h.consumer.handleTriageRequested(job, h.context);

    expect(h.channel.ack).toHaveBeenCalledWith(h.message);
  });

  it('acks after a failed triage too', async () => {
    // Not acking is what produced the loop: RabbitMQ holds the unacked message
    // for its 30-minute consumer_timeout, then hands it back and the whole
    // triage runs again — succeeding, charging credits, forever.
    const h = harness(jest.fn().mockRejectedValue(new Error('provider exploded')));

    await h.consumer.handleTriageRequested(job, h.context);

    expect(h.channel.ack).toHaveBeenCalledWith(h.message);
  });

  it('never requeues, so a poison job cannot come back on its own', async () => {
    const h = harness(jest.fn().mockRejectedValue(new Error('boom')));

    await h.consumer.handleTriageRequested(job, h.context);

    expect(h.channel.nack).not.toHaveBeenCalled();
  });

  it('does not rethrow, which the transport would treat as a requeue', async () => {
    const h = harness(jest.fn().mockRejectedValue(new Error('boom')));

    await expect(h.consumer.handleTriageRequested(job, h.context)).resolves.toBeUndefined();
  });

  it('survives a broker that refuses the ack', async () => {
    const h = harness(jest.fn().mockResolvedValue(undefined));
    h.channel.ack.mockImplementation(() => {
      throw new Error('channel closed');
    });

    // A failed ack must not kill the consumer; the message comes back later,
    // which is the safe direction to fail in.
    await expect(h.consumer.handleTriageRequested(job, h.context)).resolves.toBeUndefined();
  });

  it('works when invoked with no broker context at all', async () => {
    const orchestrate = jest.fn().mockResolvedValue(undefined);
    const consumer = new QueueConsumer({ orchestrate } as unknown as TriageService);

    await expect(consumer.handleTriageRequested(job)).resolves.toBeUndefined();
    expect(orchestrate).toHaveBeenCalledWith(job);
  });
});
