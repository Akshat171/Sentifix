import { Controller, Logger } from '@nestjs/common';
import { Ctx, EventPattern, Payload, RmqContext } from '@nestjs/microservices';
import { TriageService } from '../triage/triage.service';
import { TriageJobPayload } from './queue.producer';

@Controller()
export class QueueConsumer {
  private readonly logger = new Logger(QueueConsumer.name);

  constructor(private readonly triage: TriageService) {}

  @EventPattern('triage.requested')
  async handleTriageRequested(
    @Payload() payload: TriageJobPayload,
    @Ctx() context?: RmqContext,
  ): Promise<void> {
    this.logger.log(
      `Received triage job for issue #${payload.githubIssueNumber} in ${payload.repoFullName}`,
    );
    try {
      await this.triage.orchestrate(payload);
    } catch (err) {
      // Swallow deliberately. orchestrate() has already marked the run failed
      // and told the user; letting the error propagate makes the RabbitMQ
      // transport requeue the message, which redelivers it, creates another run
      // row, and calls the model again — forever. A bounded retry with a
      // dead-letter queue would be fine; unbounded requeue never is.
      this.logger.error(
        `Triage job for issue #${payload.githubIssueNumber} in ${payload.repoFullName} ` +
          `failed and will NOT be requeued: ${(err as Error).message}`,
      );
    } finally {
      this.ack(payload, context);
    }
  }

  /**
   * Acknowledge the message, whatever happened to the triage.
   *
   * The transport runs with noAck: false, which means Nest does not ack for us —
   * and nothing here ever did. An unacked message is not dropped, it is *held*:
   * RabbitMQ waits out its consumer_timeout (30 minutes by default), decides the
   * consumer is dead, requeues the message and hands it straight back. The job
   * then runs again, still never acks, and repeats every 30 minutes forever.
   *
   * That is not hypothetical. One issue was re-triaged 47 times in 24 hours —
   * each run succeeding, scoring 0.80, settling 5.27 credits and rewriting the
   * same GitHub comment — until the queue was purged by hand. Twice.
   *
   * Acking in `finally` rather than only on success is deliberate: a failed
   * triage that comes back unchanged fails the same way, so redelivery buys
   * nothing and costs another model call. The run row and the issue comment are
   * the durable record; the message has done its job either way.
   */
  private ack(payload: TriageJobPayload, context?: RmqContext): void {
    if (!context) return; // direct invocation (tests, retriage) has no broker message

    try {
      const channel = context.getChannelRef() as { ack?: (m: unknown) => void } | undefined;
      const message = context.getMessage();
      if (!channel?.ack || !message) return;
      channel.ack(message);
    } catch (err) {
      // A failed ack must not take the process down: the message will be
      // redelivered once the channel recovers, which is the safe direction.
      this.logger.warn(`Could not ack triage message: ${(err as Error).message}`);
    }
  }
}
