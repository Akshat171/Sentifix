import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from '../persistence/entities/account.entity';
import { AccountLink } from '../persistence/entities/account-link.entity';
import { CreditHold } from '../persistence/entities/credit-hold.entity';
import { CreditLedgerEntry } from '../persistence/entities/credit-ledger.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { UsageRecord } from '../persistence/entities/usage-record.entity';
import { AuthModule } from '../auth/auth.module';
import { AccountService } from './account.service';
import { ApiKeyController } from './api-key.controller';
import { BillingController, StripeWebhookController } from './billing.controller';
import { CustomerKeyGuard } from './customer-key.guard';
import { ApiKey } from '../persistence/entities/api-key.entity';
import { ApiKeyService } from './api-key.service';
import { EntitlementService } from './entitlement.service';
import { InsightsService } from './insights.service';
import { LlmModule } from '../llm/llm.module';
import { LowBalanceService } from './low-balance.service';
import { StripeService } from './stripe.service';
import { CostEstimator } from './cost-estimator';
import { LedgerService } from './ledger.service';
import { SpendService } from './spend.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Account,
      AccountLink,
      CreditHold,
      CreditLedgerEntry,
      UsageRecord,
      ApiKey,
      InstallationRepository,
    ]),
    AuthModule,
    LlmModule,
  ],
  controllers: [BillingController, StripeWebhookController, ApiKeyController],
  providers: [
    LedgerService,
    AccountService,
    CostEstimator,
    StripeService,
    LowBalanceService,
    InsightsService,
    ApiKeyService,
    EntitlementService,
    CustomerKeyGuard,
    SpendService,
  ],
  // The key services and the guard are exported because TriageModule's public
  // API controller is guarded by them.
  exports: [
    LedgerService,
    AccountService,
    CostEstimator,
    StripeService,
    LowBalanceService,
    InsightsService,
    ApiKeyService,
    EntitlementService,
    CustomerKeyGuard,
    SpendService,
  ],
})
export class BillingModule {}
