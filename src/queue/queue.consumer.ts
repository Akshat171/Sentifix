import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { TriageService } from '../triage/triage.service';
import { TriageJobPayload } from './queue.producer';

@Controller()
export class QueueConsumer {
  private readonly logger = new Logger(QueueConsumer.name);

  constructor(private readonly triage: TriageService) {}

  @EventPattern('triage.requested')
  async handleTriageRequested(@Payload() payload: TriageJobPayload): Promise<void> {
    this.logger.log(
      `Received triage job for issue #${payload.githubIssueNumber} in ${payload.repoFullName}`,
    );
    try {
      await this.triage.orchestrate(payload);
    } catch (err) {
      // Swallow deliberately. orchestrate() has already marked the run failed
      // and told the user; letting the error propagate makes the RabbitMQ
      // transport requeue the message, which redelivers it, creates another run
      // row, and calls the model again — forever. That loop produced thousands
      // of runs for a handful of issues and burned the provider quota it was
      // failing on. A bounded retry with a dead-letter queue would be fine;
      // unbounded requeue never is.
      this.logger.error(
        `Triage job for issue #${payload.githubIssueNumber} in ${payload.repoFullName} ` +
          `failed and will NOT be requeued: ${(err as Error).message}`,
      );
    }
  }
}
