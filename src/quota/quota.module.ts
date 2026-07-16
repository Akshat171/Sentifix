import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { Run } from '../persistence/entities/run.entity';
import { QuotaService } from './quota.service';

@Module({
  imports: [TypeOrmModule.forFeature([Run, InstallationRepository])],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
