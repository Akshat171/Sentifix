/**
 * Answers "which models in the catalog can this machine actually call?"
 *
 * Usage: pnpm check:models            (free — configuration only, no API calls)
 *        pnpm check:models --invoke   (one tiny prompt per model)
 *
 * Run it on the box that matters: your laptop and the EC2 instance resolve AWS
 * credentials from completely different places, so a pass here says nothing
 * about production.
 *
 * Without --invoke nothing is sent anywhere. With --invoke each model gets one
 * ~20-token JSON-mode request (fractions of a cent in total). That call is the
 * only conclusive test — for OpenAI the key must be valid and the model enabled
 * on the account; for Bedrock the credentials, IAM policy, region and per-model
 * access grant must all line up, and the grant only fails at invoke time.
 */

import 'reflect-metadata';
import * as dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';
import { BedrockChat } from '../src/llm/bedrock.chat';
import { CatalogEntry, MODEL_CATALOG } from '../src/llm/model-catalog';

const INVOKE = process.argv.includes('--invoke');
const PROMPT = [
  { role: 'system' as const, content: 'Reply with valid JSON only: {"ok": true}' },
  { role: 'user' as const, content: 'ping' },
];

/** Maps the raw provider failure onto the thing you actually have to go fix. */
function diagnose(err: Error): string {
  const both = `${(err as { name?: string }).name ?? ''} ${err.message ?? ''}`;

  // OpenAI
  if (/401|invalid_api_key|Incorrect API key/i.test(both))
    return 'OPENAI_API_KEY is missing, wrong, or revoked.';
  if (/model_not_found|does not exist or you do not have access/i.test(both))
    return 'This account cannot use that model — it may need a paid tier or higher usage tier.';
  if (/insufficient_quota|billing/i.test(both))
    return 'OpenAI billing problem — no credit or spend cap reached.';

  // Bedrock / AWS
  if (/AWS_REGION is not set/i.test(both))
    return 'AWS_REGION is unset, so the Bedrock client cannot be built.';
  if (/CredentialsProviderError|Could not load credentials/i.test(both))
    return 'No AWS credentials resolved. On EC2 attach an instance role; locally run `aws configure`.';
  if (/UnrecognizedClientException|InvalidSignatureException/i.test(both))
    return 'AWS rejected the credentials — wrong, disabled, or rotated.';
  if (/ExpiredToken/i.test(both)) return 'AWS credentials expired. Refresh the session token.';
  if (/not authorized|don.t have access to the model|AccessDeniedException/i.test(both))
    return 'Account or IAM not authorised for this model. Grant model access in the Bedrock console for THIS region, and check the account itself is approved for the provider.';
  if (/ResourceNotFoundException|model identifier is invalid|ValidationException/i.test(both))
    return `Model ID not valid in ${process.env.AWS_REGION}. Claude is not in every region.`;

  if (/ThrottlingException|429|rate.?limit/i.test(both))
    return 'Throttled — access works, you are over quota.';
  return 'Unmapped error.';
}

async function invoke(model: CatalogEntry, openai: OpenAI): Promise<string> {
  if (model.vendor === 'openai') {
    const res = await openai.chat.completions.create({
      model: model.modelId,
      messages: PROMPT,
      response_format: { type: 'json_object' },
    });
    return res.choices[0]?.message?.content ?? '';
  }

  const region = process.env.AWS_REGION;
  if (!region) throw new Error('AWS_REGION is not set');
  return (await new BedrockChat(region, model.modelId, 64).chat(PROMPT, true, model.modelId)).text;
}

async function main(): Promise<void> {
  const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);
  const region = process.env.AWS_REGION;

  console.log(
    `\nOPENAI_API_KEY : ${hasOpenAiKey ? 'set' : '✗ not set — every OpenAI model will fail'}`,
  );
  console.log(`AWS_REGION     : ${region ?? '✗ not set — every Bedrock model will fail'}\n`);

  if (!INVOKE) {
    for (const m of MODEL_CATALOG) {
      const configured = m.vendor === 'openai' ? hasOpenAiKey : Boolean(region);
      console.log(
        `  ${m.key.padEnd(15)} ${m.vendor.padEnd(8)} ${m.tier.padEnd(9)} ` +
          `${m.selectable ? 'on menu ' : 'legacy  '} ${configured ? 'configured' : 'NOT configured'}`,
      );
    }
    console.log(
      '\n"configured" only means the credential exists. Run with --invoke to prove it works.\n',
    );
    return;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const broken: string[] = [];

  for (const model of MODEL_CATALOG) {
    process.stdout.write(`  ${model.key.padEnd(15)} `);
    const started = Date.now();
    try {
      const reply = await invoke(model, openai);
      JSON.parse(reply); // the pipeline does a bare JSON.parse — prove it survives
      console.log(`✓ ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (err) {
      broken.push(model.key);
      console.log(`✗ ${(err as Error).name || 'Error'}`);
      console.log(`  ${''.padEnd(15)} → ${diagnose(err as Error)}`);
    }
  }

  const usable = MODEL_CATALOG.filter((m) => m.selectable && !broken.includes(m.key));
  console.log(
    `\nSellable today: ${usable.length ? usable.map((m) => m.key).join(', ') : 'none'}` +
      (broken.length ? `\nUnavailable   : ${broken.join(', ')}` : '') +
      '\n\nOnly put clients on models listed as sellable.\n',
  );
  process.exit(broken.length ? 1 : 0);
}

main().catch((err) => {
  console.error(`\nUnexpected failure: ${(err as Error).message}\n`);
  process.exit(1);
});
