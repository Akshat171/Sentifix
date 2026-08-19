import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Installation } from '../persistence/entities/installation.entity';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { SlackInstallation } from '../persistence/entities/slack-installation.entity';
import { LlmProvider } from './llm.provider';
import { TenantModelService } from './tenant-model.service';

@Module({
  imports: [TypeOrmModule.forFeature([Installation, InstallationRepository, SlackInstallation])],
  providers: [LlmProvider, TenantModelService],
  exports: [LlmProvider, TenantModelService],
})
export class LlmModule {}
