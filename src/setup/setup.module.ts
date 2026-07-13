import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Installation } from '../persistence/entities/installation.entity';
import { SetupController } from './setup.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Installation]), AuthModule],
  controllers: [SetupController],
})
export class SetupModule {}
