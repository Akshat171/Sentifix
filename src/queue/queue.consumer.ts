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
    await this.triage.orchestrate(payload);
  }
}
