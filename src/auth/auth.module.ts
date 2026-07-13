import { Module } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { AuthController } from './auth.controller';
import { GithubOAuthService } from './github-oauth.service';
import { SessionGuard } from './session.guard';
import { SessionService } from './session.service';

@Module({
  controllers: [AuthController],
  providers: [ApiKeyGuard, SessionGuard, SessionService, GithubOAuthService],
  exports: [ApiKeyGuard, SessionGuard, SessionService],
})
export class AuthModule {}
