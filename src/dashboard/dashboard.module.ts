import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { DashboardController } from './dashboard.controller';
import { UsageController } from './usage.controller';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [DashboardController, UsageController],
})
export class DashboardModule {}
