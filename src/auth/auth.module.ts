import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccessGrant } from '../persistence/entities/access-grant.entity';
import { AccessService } from './access.service';
import { ApiKeyGuard } from './api-key.guard';
import { AccessController } from './access.controller';
import { AuthController } from './auth.controller';
import { GithubOAuthService } from './github-oauth.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  imports: [TypeOrmModule.forFeature([AccessGrant])],
  controllers: [AuthController, AccessController],
  providers: [ApiKeyGuard, SessionGuard, SessionService, GithubOAuthService, AccessService],
  exports: [ApiKeyGuard, SessionGuard, SessionService, AccessService],
})
export class AuthModule {}
