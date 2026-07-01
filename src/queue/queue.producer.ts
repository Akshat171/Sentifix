import { Inject, Injectable, Logger } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { QUEUE_SERVICE } from './queue.constants';

export interface TriageJobPayload {
  issueId: string;
  githubRepoId: string;
  githubIssueNumber: number;
  repoFullName: string;
}

@Injectable()
export class QueueProducer {
  private readonly logger = new Logger(QueueProducer.name);

  constructor(@Inject(QUEUE_SERVICE) private readonly client: ClientProxy) {}

  async enqueueTriageJob(payload: TriageJobPayload): Promise<void> {
    this.logger.log(`Enqueuing triage job for issue ${payload.githubIssueNumber}`);
    this.client.emit('triage.requested', payload);
  }
}
