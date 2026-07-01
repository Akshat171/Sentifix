import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configSchema } from './config.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      validate: (config: Record<string, unknown>) => {
        const { error, value } = configSchema.validate(config, {
          abortEarly: false,
          allowUnknown: true,
        });
        if (error) {
          throw new Error(`Config validation failed:\n${error.message}`);
        }
        return value as Record<string, unknown>;
      },
    }),
  ],
})
export class AppConfigModule {}
