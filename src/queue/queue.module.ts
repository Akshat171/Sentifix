import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { QUEUE_SERVICE } from './queue.constants';
import { QueueProducer } from './queue.producer';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: QUEUE_SERVICE,
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('RABBITMQ_URL') as string],
            queue: 'sentifix_triage',
            queueOptions: { durable: true },
          },
        }),
        inject: [ConfigService],
      },
    ]),
  ],
  providers: [QueueProducer],
  exports: [QueueProducer],
})
export class QueueModule {}
