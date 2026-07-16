import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnownBlock, WebClient } from '@slack/web-api';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';

export interface SlackTriagePayload {
  channel: string;
  threadTs: string;
  placeholderTs: string;
  teamId?: string;
  classification: Record<string, unknown>;
  diagnosis: Record<string, unknown>;
  proposedDiff: string;
  evalScore: number;
  evalBreakdown: Record<string, number>;
  evalRationale: string;
  prUrl?: string;
  prNumber?: number;
  runId: string;
  repoFullName: string;
}

const SEV_EMOJI: Record<string, string> = {
  critical: '🔴', high: '🟠', medium: '🟡', low: '🟢',
};

@Injectable()
export class SlackService {
  private readonly logger = new Logger(SlackService.name);
  private readonly fallbackToken?: string; // legacy single-workspace token from env

  constructor(
    config: ConfigService,
    @InjectRepository(SlackInstallation)
    private readonly installRepo: Repository<SlackInstallation>,
  ) {
    this.fallbackToken = config.get<string>('SLACK_BOT_TOKEN');
  }

  /** Resolve the bot token for a workspace (per-tenant), falling back to the env token. */
  private async getClient(teamId?: string): Promise<WebClient | null> {
    if (teamId) {
      const inst = await this.installRepo.findOne({ where: { teamId } });
      if (inst?.botToken) return new WebClient(inst.botToken);
    }
    return this.fallbackToken ? new WebClient(this.fallbackToken) : null;
  }

  /** Per-workspace default repo (set at install time), if any. */
  async defaultRepoForTeam(teamId?: string): Promise<string | null> {
    if (!teamId) return null;
    const inst = await this.installRepo.findOne({ where: { teamId } });
    return inst?.defaultRepo ?? null;
  }

  async postPlaceholder(channel: string, threadTs: string, teamId?: string): Promise<string | null> {
    const client = await this.getClient(teamId);
    if (!client) return null;
    try {
      const res = await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: '🤖 Sentifix is analyzing this error...',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*🤖 Sentifix is analyzing this error...*\n⏳ Classify → Retrieve code context → Diagnose → Propose fix\n_This message will be updated with the full report._',
            },
          },
        ],
      });
      return res.ts as string;
    } catch (err) {
      this.logger.error(`Failed to post Slack placeholder: ${(err as Error).message}`);
      return null;
    }
  }

  async updateWithTriageResult(payload: SlackTriagePayload): Promise<void> {
    const client = await this.getClient(payload.teamId);
    if (!client) return;

    const cls = payload.classification as { severity?: string; category?: string; affectedComponents?: string[] };
    const diag = payload.diagnosis as { rootCause?: string; hypothesis?: string };
    const score = Math.round(payload.evalScore * 100);
    const sevEmoji = SEV_EMOJI[cls.severity?.toLowerCase() ?? ''] ?? '⚪';
    const scoreBar = '█'.repeat(Math.round(payload.evalScore * 10)) + '░'.repeat(10 - Math.round(payload.evalScore * 10));

    const diffPreview = payload.proposedDiff
      .replace(/^```diff\n?/, '').replace(/\n?```$/, '')
      .split('\n').slice(0, 15).join('\n');

    const blocks: KnownBlock[] = [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🤖 Sentifix Triage Report', emoji: true },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Severity:*\n${sevEmoji} ${this.cap(cls.severity ?? '-')}` },
          { type: 'mrkdwn', text: `*Category:*\n${this.cap(cls.category ?? '-')}` },
          { type: 'mrkdwn', text: `*Score:*\n${scoreBar} ${score}/100` },
          { type: 'mrkdwn', text: `*Affected:*\n${(cls.affectedComponents ?? []).join(', ') || '-'}` },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Root Cause*\n${diag.rootCause ?? '-'}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Hypothesis*\n${diag.hypothesis ?? '-'}` },
      },
    ];

    if (diffPreview && diffPreview !== '# insufficient-context') {
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: `*Proposed Fix*\n\`\`\`${diffPreview}\`\`\`` },
      });
    }

    if (payload.prUrl) {
      blocks.push({
        type: 'actions',
        elements: [{
          type: 'button',
          text: { type: 'plain_text', text: `🔀 View PR #${payload.prNumber}`, emoji: true },
          url: payload.prUrl,
          style: 'primary',
        }],
      });
    }

    blocks.push({
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `Correctness ${Math.round((payload.evalBreakdown.correctness ?? 0) * 100)}% · Completeness ${Math.round((payload.evalBreakdown.completeness ?? 0) * 100)}% · Safety ${Math.round((payload.evalBreakdown.safety ?? 0) * 100)}% · Clarity ${Math.round((payload.evalBreakdown.clarity ?? 0) * 100)}%  |  Run \`${payload.runId.slice(0, 8)}\``,
      }],
    });

    try {
      await client.chat.update({
        channel: payload.channel,
        ts: payload.placeholderTs,
        text: `Sentifix triage complete — ${sevEmoji} ${this.cap(cls.severity ?? '')} / score ${score}/100`,
        blocks,
      });
      this.logger.log(`Updated Slack thread ${payload.threadTs} with triage result`);
    } catch (err) {
      this.logger.error(`Failed to update Slack message: ${(err as Error).message}`);
    }
  }

  private cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
