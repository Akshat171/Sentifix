import './tracing'; // Must be first — initialises OTel SDK before any instrumented code loads
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { Logger } from '@nestjs/common';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    rawBody: true,
  });

  // Static media (the launch video and its posters). Served from the repo root
  // rather than dist/, so the build does not have to copy binaries around;
  // cached hard because the filenames are stable and the content is immutable.
  app.useStaticAssets({
    root: join(process.cwd(), 'public'),
    prefix: '/static/',
    maxAge: '30d',
    immutable: true,
    index: false,
  });

  // Connect RabbitMQ consumer — makes @EventPattern decorators active
  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.RMQ,
    options: {
      urls: [process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672'],
      queue: 'sentifix_triage',
      queueOptions: { durable: true },
      noAck: false,
    },
  });

  await app.startAllMicroservices();

  const port = process.env.PORT ?? 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Sentifix running on port ${port} | RabbitMQ consumer active`);
}

bootstrap();
