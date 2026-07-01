import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly apiKey: string | undefined;

  constructor(config: ConfigService) {
    this.apiKey = config.get<string>('API_KEY');
  }

  canActivate(context: ExecutionContext): boolean {
    // If no API_KEY configured, guard is disabled (open dev mode)
    if (!this.apiKey) return true;

    const request = context.switchToHttp().getRequest<{ headers: Record<string, string>; query: Record<string, string> }>();
    const provided =
      (request.headers['x-api-key'] as string) ??
      (request.query as Record<string, string>)['api_key'];

    if (provided !== this.apiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }
    return true;
  }
}
