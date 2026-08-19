import {
  BadRequestException,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard } from './admin.guard';
import { TenantModelService } from '../llm/tenant-model.service';
import { LlmProvider } from '../llm/llm.provider';

function ctxWithKey(key?: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ headers: key ? { 'x-api-key': key } : {} }) }),
  } as unknown as ExecutionContext;
}

const cfg = (values: Record<string, unknown>) =>
  ({ get: (k: string) => values[k] }) as unknown as ConfigService;

describe('AdminGuard', () => {
  it('refuses everything when no key is configured — fails closed', () => {
    const guard = new AdminGuard(cfg({}));
    expect(() => guard.canActivate(ctxWithKey('anything'))).toThrow(UnauthorizedException);
  });

  it('accepts the configured admin key', () => {
    const guard = new AdminGuard(cfg({ ADMIN_API_KEY: 'sekret' }));
    expect(guard.canActivate(ctxWithKey('sekret'))).toBe(true);
  });

  it('rejects a wrong key, a missing header, and a prefix of the real key', () => {
    const guard = new AdminGuard(cfg({ ADMIN_API_KEY: 'sekret' }));
    expect(() => guard.canActivate(ctxWithKey('wrong'))).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctxWithKey())).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(ctxWithKey('sek'))).toThrow(UnauthorizedException);
  });

  it('falls back to API_KEY when ADMIN_API_KEY is absent', () => {
    const guard = new AdminGuard(cfg({ API_KEY: 'shared' }));
    expect(guard.canActivate(ctxWithKey('shared'))).toBe(true);
  });
});

describe('TenantModelService.setTier', () => {
  const llm = { chatModel: 'gpt-5.6-luna', rerankModel: 'gpt-5.6-luna' } as LlmProvider;

  function build(install: Record<string, unknown> | null) {
    const save = jest.fn(async (x) => x);
    const installations = { findOne: jest.fn().mockResolvedValue(install), save } as never;
    const svc = new TenantModelService(
      cfg({}),
      installations,
      { findOne: jest.fn() } as never,
      { findOne: jest.fn().mockResolvedValue(null) } as never,
      llm,
    );
    return { svc, save };
  }

  it('writes a sellable key onto the installation', async () => {
    const { svc, save } = build({ installationId: 42, accountLogin: 'acme', modelKey: null });
    const result = await svc.setTier('github', '42', 'gpt-5.6-sol');

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'gpt-5.6-sol' }));
    expect(result.modelKey).toBe('gpt-5.6-sol');
    expect(result.effective.chat).toBe('gpt-5.6-sol');
    expect(result.usingDefault).toBe(false);
  });

  it('accepts null to hand the tenant back to the deployment default', async () => {
    const { svc, save } = build({
      installationId: 42,
      accountLogin: 'acme',
      modelKey: 'gpt-5.6-sol',
    });
    const result = await svc.setTier('github', '42', null);

    expect(save).toHaveBeenCalledWith(expect.objectContaining({ modelKey: null }));
    expect(result.usingDefault).toBe(true);
    expect(result.effective.chat).toBe('gpt-5.6-luna');
  });

  it('refuses a model that is not on the menu', async () => {
    const { svc, save } = build({ installationId: 42, accountLogin: 'acme', modelKey: null });
    await expect(svc.setTier('github', '42', 'gpt-4o')).rejects.toThrow(BadRequestException);
    await expect(svc.setTier('github', '42', 'nonsense')).rejects.toThrow(BadRequestException);
    expect(save).not.toHaveBeenCalled();
  });

  it('refuses a non-numeric GitHub tenant id', async () => {
    const { svc } = build({ installationId: 42, accountLogin: 'acme', modelKey: null });
    await expect(svc.setTier('github', 'acme/repo', 'gpt-5.6-sol')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('404s on an unknown tenant rather than silently creating one', async () => {
    const { svc } = build(null);
    await expect(svc.setTier('github', '999', 'gpt-5.6-sol')).rejects.toThrow(NotFoundException);
  });
});
