import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountLink } from '../persistence/entities/account-link.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';
import { DashboardController } from './dashboard.controller';
import { HomeController } from './home.controller';
import { IntegrationsController } from './integrations.controller';
import { KeysController } from './keys.controller';
import { OverviewController } from './overview.controller';
import { UsageController } from './usage.controller';

@Module({
  imports: [
    AuthModule,
    BillingModule,
    TypeOrmModule.forFeature([InstallationRepository, AccountLink, SlackInstallation]),
  ],
  controllers: [
    OverviewController,
    HomeController,
    DashboardController,
    UsageController,
    KeysController,
    IntegrationsController,
  ],
})
export class DashboardModule {}
