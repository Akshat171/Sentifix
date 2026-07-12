import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import * as crypto from 'crypto';
import {
  GithubInstallationPayload,
  GithubInstallationReposPayload,
  GithubIssueCommentPayload,
  GithubIssuePayload,
  GithubPushPayload,
  IngestionService,
} from './ingestion.service';

@SkipThrottle()
@Controller('webhooks')
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly ingestion: IngestionService,
    config: ConfigService,
  ) {
    this.webhookSecret = config.get<string>('GITHUB_WEBHOOK_SECRET') ?? '';
  }

  @Post('github')
  @HttpCode(202)
  async handleGithubWebhook(
    @Headers('x-github-event') event: string,
    @Headers('x-hub-signature-256') signature: string,
    @Body() payload: GithubIssuePayload & GithubPushPayload & GithubInstallationPayload & GithubInstallationReposPayload & GithubIssueCommentPayload,
    @Req() req: RawBodyRequest<{ rawBody?: Buffer }>,
  ): Promise<{ received: boolean }> {
    const rawBody = req.rawBody;
    if (!rawBody) throw new BadRequestException('Missing raw body');

    this.validateHmac(rawBody, signature);

    const fire = (p: Promise<void>, label: string) =>
      p.catch((err: Error) => this.logger.error(`${label} failed: ${err.message}`, err.stack));

    if (event === 'issues') {
      fire(this.ingestion.handleIssueEvent(payload), 'Issue event');
    } else if (event === 'issue_comment') {
      fire(this.ingestion.handleIssueCommentEvent(payload), 'Issue comment event');
    } else if (event === 'push') {
      fire(this.ingestion.handlePushEvent(payload), 'Push event');
    } else if (event === 'installation') {
      fire(this.ingestion.handleInstallationEvent(payload), 'Installation event');
    } else if (event === 'installation_repositories') {
      fire(this.ingestion.handleInstallationReposEvent(payload), 'InstallationRepos event');
    } else {
      this.logger.debug(`Ignoring GitHub event: ${event}`);
    }

    return { received: true };
  }

  private validateHmac(rawBody: Buffer, signature: string): void {
    if (!signature) throw new UnauthorizedException('Missing signature');

    const expected = `sha256=${crypto
      .createHmac('sha256', this.webhookSecret)
      .update(rawBody)
      .digest('hex')}`;

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid signature');
    }
  }
}
