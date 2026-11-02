import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RABBITMQ_SERVICE } from './rabbitmq.constants';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: RABBITMQ_SERVICE,
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.RMQ,
          options: {
            urls: [config.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672')],
            queue: 'crm_main',
            queueOptions: {
              durable: true,
              arguments: {
                'x-dead-letter-exchange': 'dlx',
                'x-dead-letter-routing-key': 'dlq.main',
              },
            },
            noAck: true,
            prefetchCount: 10,
          },
        }),
      },
    ]),
  ],
  exports: [ClientsModule],
})
export class RabbitMQModule {}
