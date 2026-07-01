import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Logger,
  Post,
  RawBodyRequest,
  Req,
  Headers,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { SlackIngestionService, SlackMentionEvent } from './slack-ingestion.service';

interface SlackEventWrapper {
  type: string;
  challenge?: string;         // url_verification
  event?: SlackMentionEvent;
  team_id?: string;
}

@SkipThrottle()
@Controller('webhooks')
export class SlackController {
  private readonly logger = new Logger(SlackController.name);
  private readonly signingSecret: string;

  constructor(
    private readonly ingestion: SlackIngestionService,
    config: ConfigService,
  ) {
    this.signingSecret = config.get<string>('SLACK_SIGNING_SECRET') ?? '';
  }

  @Post('slack')
  @HttpCode(200)
  async handleSlackEvent(
    @Body() body: SlackEventWrapper,
    @Headers('x-slack-signature') signature: string,
    @Headers('x-slack-request-timestamp') timestamp: string,
    @Req() req: RawBodyRequest<{ rawBody?: Buffer }>,
  ): Promise<unknown> {
    // Verify Slack signature (HMAC-SHA256)
    if (this.signingSecret) {
      const rawBody = req.rawBody;
      if (!rawBody) throw new BadRequestException('Missing raw body');
      this.verifySignature(rawBody, signature, timestamp);
    }

    // Slack URL verification challenge (one-time on webhook setup)
    if (body.type === 'url_verification') {
      this.logger.log('Slack URL verification challenge responded');
      return { challenge: body.challenge };
    }

    // App mention event
    if (body.type === 'event_callback' && body.event?.type === 'app_mention') {
      const event = body.event;
      // Attach team_id from wrapper
      event.team = body.team_id ?? event.team ?? '';

      // Fire-and-forget — Slack requires 200 within 3 seconds
      this.ingestion.handleMention(event).catch((err: Error) => {
        this.logger.error(`Slack mention handling failed: ${err.message}`, err.stack);
      });
    }

    return { ok: true };
  }

  private verifySignature(rawBody: Buffer, signature: string, timestamp: string): void {
    if (!signature || !timestamp) throw new UnauthorizedException('Missing Slack signature');

    // Reject requests older than 5 minutes (replay attack prevention)
    const age = Math.abs(Date.now() / 1000 - parseInt(timestamp, 10));
    if (age > 300) throw new UnauthorizedException('Slack request too old');

    const baseString = `v0:${timestamp}:${rawBody.toString()}`;
    const expected = `v0=${crypto.createHmac('sha256', this.signingSecret).update(baseString).digest('hex')}`;

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expected);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      throw new UnauthorizedException('Invalid Slack signature');
    }
  }
}
