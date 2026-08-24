import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { LlmModule } from '../llm/llm.module';
import { AdminController } from './admin.controller';
import { AdminUiController } from './admin-ui.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [LlmModule, BillingModule, AuthModule],
  controllers: [AdminUiController, AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
