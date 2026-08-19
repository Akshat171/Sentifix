import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { LlmModule } from '../llm/llm.module';
import { AdminController } from './admin.controller';
import { AdminUiController } from './admin-ui.controller';
import { AdminGuard } from './admin.guard';

@Module({
  imports: [LlmModule, BillingModule],
  controllers: [AdminUiController, AdminController],
  providers: [AdminGuard],
})
export class AdminModule {}
