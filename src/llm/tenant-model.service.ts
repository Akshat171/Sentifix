import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Installation } from '../persistence/entities/installation.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';
import { LlmProvider } from './llm.provider';
import { isSelectable, isUpgradeOver, ModelSelection, selectableModels } from './model-catalog';

/**
 * Resolves which models a given tenant's triage run should use.
 *
 * Both intake paths (GitHub App installation, Slack workspace) store an
 * optional catalog key; null means "use the deployment default", which is what
 * every single-tenant self-host does. An unrecognised or de-listed key falls
 * back to the default rather than failing the run — a stale value in the
 * database should degrade a tenant's tier, not drop their bug report.
 */
export type LinkProvider = 'github' | 'slack';

export interface TenantTier {
  provider: LinkProvider;
  externalId: string;
  /** Human-readable: the GitHub org/user, or the Slack workspace name. */
  label: string;
  /** What is stored. Null means "follow the deployment default". */
  modelKey: string | null;
  /** What a run would actually use right now, after fallback and escalation rules. */
  effective: ModelSelection;
  usingDefault: boolean;
}

@Injectable()
export class TenantModelService {
  private readonly logger = new Logger(TenantModelService.name);

  private readonly escalationModel?: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Installation)
    private readonly installations: Repository<Installation>,
    @InjectRepository(InstallationRepository)
    private readonly repoMap: Repository<InstallationRepository>,
    @InjectRepository(SlackInstallation)
    private readonly slackInstallations: Repository<SlackInstallation>,
    private readonly llm: LlmProvider,
  ) {
    this.escalationModel = config.get<boolean>('ESCALATION_ENABLED')
      ? (config.get<string>('ESCALATION_MODEL') ?? undefined)
      : undefined;
  }

  /** Deployment-wide defaults, used when a tenant has expressed no preference. */
  defaults(): ModelSelection {
    return this.withEscalation({ chat: this.llm.chatModel, rerank: this.llm.rerankModel });
  }

  /**
   * Only offer an escalation target that is actually a step up. Without this an
   * Opus tenant whose fix scored badly would be "escalated" down to GPT-4o mini,
   * spending a second call to get a worse answer.
   */
  private withEscalation(selection: ModelSelection): ModelSelection {
    if (!this.escalationModel) return selection;
    if (!isUpgradeOver(this.escalationModel, selection.chat)) return selection;
    return { ...selection, escalate: this.escalationModel };
  }

  async forRepo(repoFullName: string): Promise<ModelSelection> {
    const mapping = await this.repoMap.findOne({ where: { repoFullName } });
    if (!mapping) return this.defaults();

    const install = await this.installations.findOne({
      where: { installationId: mapping.installationId },
    });
    return this.selectionFor(install?.modelKey ?? null, `repo ${repoFullName}`);
  }

  async forSlackTeam(teamId: string): Promise<ModelSelection> {
    const install = await this.slackInstallations.findOne({ where: { teamId } });
    return this.selectionFor(install?.modelKey ?? null, `slack team ${teamId}`);
  }

  // ── Tier administration ────────────────────────────────────────────────────

  /**
   * Move a tenant onto a different model, or back to the deployment default.
   *
   * Reading and writing the tier live together deliberately: the validation that
   * rejects an unsellable key is the same rule selectionFor() applies when it
   * falls back, and splitting them is how the two drift apart.
   */
  async setTier(
    provider: LinkProvider,
    externalId: string,
    modelKey: string | null,
  ): Promise<TenantTier> {
    if (modelKey !== null && !isSelectable(modelKey)) {
      throw new BadRequestException(
        `"${modelKey}" is not a sellable model. Options: ${selectableModels()
          .map((m) => m.key)
          .join(', ')}`,
      );
    }

    if (provider === 'github') {
      const installationId = Number(externalId);
      if (!Number.isInteger(installationId)) {
        throw new BadRequestException('GitHub tenant id must be a numeric installation ID');
      }
      const install = await this.installations.findOne({ where: { installationId } });
      if (!install) throw new NotFoundException(`No GitHub installation ${externalId}`);
      install.modelKey = modelKey;
      await this.installations.save(install);
      this.logger.log(`github:${externalId} tier -> ${modelKey ?? 'default'}`);
      return this.describe('github', externalId, install.accountLogin, modelKey);
    }

    const workspace = await this.slackInstallations.findOne({ where: { teamId: externalId } });
    if (!workspace) throw new NotFoundException(`No Slack workspace ${externalId}`);
    workspace.modelKey = modelKey;
    await this.slackInstallations.save(workspace);
    this.logger.log(`slack:${externalId} tier -> ${modelKey ?? 'default'}`);
    return this.describe('slack', externalId, workspace.teamName ?? externalId, modelKey);
  }

  /** Every tenant and the tier it is on, for the admin list view. */
  async listTenants(): Promise<TenantTier[]> {
    const [github, slack] = await Promise.all([
      this.installations.find(),
      this.slackInstallations.find(),
    ]);

    return [
      ...github.map((i) =>
        this.describe('github', String(i.installationId), i.accountLogin, i.modelKey),
      ),
      ...slack.map((w) => this.describe('slack', w.teamId, w.teamName ?? w.teamId, w.modelKey)),
    ];
  }

  private describe(
    provider: LinkProvider,
    externalId: string,
    label: string,
    modelKey: string | null,
  ): TenantTier {
    return {
      provider,
      externalId,
      label,
      modelKey,
      effective: this.selectionFor(modelKey, `${provider}:${externalId}`),
      usingDefault: modelKey === null,
    };
  }

  private selectionFor(modelKey: string | null, subject: string): ModelSelection {
    if (!modelKey) return this.defaults();

    if (!isSelectable(modelKey)) {
      this.logger.warn(
        `${subject} is pinned to unknown/de-listed model "${modelKey}" — using defaults`,
      );
      return this.defaults();
    }

    // Reranking is high-volume and low-stakes, so it tracks the tenant's chat
    // model rather than getting its own setting.
    return this.withEscalation({ chat: modelKey, rerank: modelKey });
  }
}
