/**
 * The set of models a client may be put on.
 *
 * This file is the single source of truth for the menu: adding a model here is
 * the whole change — routing, validation and the dashboard dropdown all read
 * from it, and no other file needs to know the vendor exists.
 *
 * Model IDs are not portable between vendors. OpenAI wants `gpt-4o-mini`,
 * Bedrock wants the `anthropic.`-prefixed form. Callers pass the stable `key`
 * and LlmProvider swaps in `modelId` on the wire, so a key stored against a
 * tenant stays valid even if the underlying ID is re-pointed.
 */

export type LlmVendor = 'openai' | 'bedrock';

/** Rough price/capability band. Drives ordering and labelling in the UI only. */
export type ModelTier = 'economy' | 'standard' | 'premium';

export interface CatalogEntry {
  /** Stable identifier persisted against a tenant and accepted by the API. */
  key: string;
  /** Human-facing name for the dashboard. */
  label: string;
  vendor: LlmVendor;
  /** Vendor-specific ID sent on the wire. */
  modelId: string;
  tier: ModelTier;
  /**
   * Vendor list price in USD per million tokens — the raw cost, NOT the sale
   * price. Your margin is the CREDIT_MARKUP config, applied once at billing time,
   * so these stay directly checkable against the vendor's own pricing page.
   */
  usdPerMTokIn: number;
  usdPerMTokOut: number;
  /** When the two rates above were last checked. Stale rates quietly erode margin. */
  pricedOn: string;
  /**
   * Off-menu models are still routable (so a pinned judge or a legacy tenant
   * keeps working) but are not offered to clients as a choice.
   */
  selectable: boolean;
}

export const MODEL_CATALOG: readonly CatalogEntry[] = [
  // OpenAI, reached with OPENAI_API_KEY over the normal chat-completions API.
  // Entirely independent of AWS — these keep working while Bedrock access is
  // pending, which is why the deployment defaults point here.
  {
    key: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    vendor: 'openai',
    modelId: 'gpt-5.6-luna',
    tier: 'economy',
    usdPerMTokIn: 0.2,
    usdPerMTokOut: 1.2,
    pricedOn: '2026-08-18',
    selectable: true,
  },
  {
    key: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    vendor: 'openai',
    modelId: 'gpt-5.6-terra',
    tier: 'standard',
    usdPerMTokIn: 2.0,
    usdPerMTokOut: 12.0,
    pricedOn: '2026-08-18',
    selectable: true,
  },
  {
    key: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    vendor: 'openai',
    modelId: 'gpt-5.6-sol',
    tier: 'premium',
    usdPerMTokIn: 5.0,
    usdPerMTokOut: 30.0,
    pricedOn: '2026-08-18',
    selectable: true,
  },
  // Superseded, kept routable so existing .env values and any tenant already
  // pinned to them keep working. Not offered to new clients.
  {
    key: 'gpt-4o-mini',
    label: 'GPT-4o mini (legacy)',
    vendor: 'openai',
    modelId: 'gpt-4o-mini',
    tier: 'economy',
    usdPerMTokIn: 0.15,
    usdPerMTokOut: 0.6,
    pricedOn: '2026-08-18',
    selectable: false,
  },
  {
    key: 'gpt-4o',
    label: 'GPT-4o (legacy)',
    vendor: 'openai',
    modelId: 'gpt-4o',
    tier: 'standard',
    usdPerMTokIn: 2.5,
    usdPerMTokOut: 10.0,
    pricedOn: '2026-08-18',
    selectable: false,
  },
  // Anthropic, reached through Amazon Bedrock. Requires an AWS account with
  // model access granted per model per region — verify with `pnpm check:models`
  // before putting a client on one of these.
  {
    key: 'claude-haiku',
    label: 'Claude Haiku 4.5',
    vendor: 'bedrock',
    modelId: 'anthropic.claude-haiku-4-5',
    tier: 'economy',
    usdPerMTokIn: 1.0,
    usdPerMTokOut: 5.0,
    pricedOn: '2026-08-18',
    selectable: true,
  },
  {
    key: 'claude-sonnet',
    label: 'Claude Sonnet 5',
    vendor: 'bedrock',
    modelId: 'anthropic.claude-sonnet-5',
    tier: 'standard',
    usdPerMTokIn: 3.0,
    usdPerMTokOut: 15.0,
    pricedOn: '2026-08-18',
    selectable: true,
  },
  {
    key: 'claude-opus',
    label: 'Claude Opus 5',
    vendor: 'bedrock',
    modelId: 'anthropic.claude-opus-5',
    tier: 'premium',
    usdPerMTokIn: 5.0,
    usdPerMTokOut: 25.0,
    pricedOn: '2026-08-18',
    selectable: true,
  },
];

const BY_KEY = new Map(MODEL_CATALOG.map((m) => [m.key, m]));

export function findModel(key: string): CatalogEntry | undefined {
  return BY_KEY.get(key);
}

/** Throws rather than silently falling back — an unknown key is a config bug. */
export function requireModel(key: string): CatalogEntry {
  const entry = BY_KEY.get(key);
  if (!entry) {
    throw new Error(`Unknown model key "${key}". Known keys: ${[...BY_KEY.keys()].join(', ')}`);
  }
  return entry;
}

/** What the dashboard offers and the API accepts as a tenant's choice. */
export function selectableModels(): CatalogEntry[] {
  return MODEL_CATALOG.filter((m) => m.selectable);
}

export function isSelectable(key: string): boolean {
  return findModel(key)?.selectable ?? false;
}

export const MODEL_KEYS = MODEL_CATALOG.map((m) => m.key);

const TIER_RANK: Record<ModelTier, number> = { economy: 0, standard: 1, premium: 2 };

/** True when `candidate` is a genuine step up from `current`. */
export function isUpgradeOver(candidate: string, current: string): boolean {
  const a = findModel(candidate);
  const b = findModel(current);
  if (!a || !b) return false;
  return TIER_RANK[a.tier] > TIER_RANK[b.tier];
}

/**
 * The models a single triage run should use.
 *
 * Deliberately has no judge field: the eval judge is pinned globally so scores
 * stay comparable across tenants. If a budget tenant graded its own output with
 * a budget judge, eval scores would no longer mean the same thing run to run.
 */
export interface ModelSelection {
  chat: string;
  rerank: string;
  /**
   * Model to retry the fix on when the judge scores the first attempt poorly.
   * Undefined means no escalation — either it is switched off, or `chat` is
   * already at or above the escalation model's tier.
   */
  escalate?: string;
}
