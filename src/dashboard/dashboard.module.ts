import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { DashboardController } from './dashboard.controller';
import { HomeController } from './home.controller';
import { KeysController } from './keys.controller';
import { UsageController } from './usage.controller';

@Module({
  imports: [AuthModule, BillingModule, TypeOrmModule.forFeature([InstallationRepository])],
  controllers: [HomeController, DashboardController, UsageController, KeysController],
})
export class DashboardModule {}
