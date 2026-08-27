import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { InstallationRepository } from '../persistence/entities/installation-repository.entity';
import { EventsController } from './events.controller';
import { RunEventsService } from './run-events.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([InstallationRepository])],
  controllers: [EventsController],
  providers: [RunEventsService],
  // TriageModule publishes; this module is the only place that subscribes.
  exports: [RunEventsService],
})
export class EventsModule {}
