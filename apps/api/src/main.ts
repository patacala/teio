import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { Transport } from '@nestjs/microservices';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import compression from 'compression';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  // rawBody: true buffers raw body for HMAC verification (Retell webhooks)
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
    rawBody: true,
    // Default Express JSON limit is 100kb. Pasting a long markdown into
    // POST /knowledge (a 143KB file already exceeds it) is rejected before
    // the handler runs. File uploads use multer, not this parser. rawBody
    // stays on so webhook HMAC verification still sees the original bytes.
    bodyParser: false,
  });
  app.useBodyParser('json', { limit: '20mb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '20mb' });

  const configService = app.get(ConfigService);
  const port = configService.get<number>('api.port', 3001);

  // Security
  app.use(helmet());
  app.use(compression());

  // CORS — multi-origin support for CRM web + landing page
  const allowedOrigins = [
    configService.get<string>('NEXT_PUBLIC_WEB_URL', 'http://localhost:3000'),
    configService.get<string>('NEXT_PUBLIC_LANDING_URL', ''),
  ].filter(Boolean);
  console.log(`🔒 CORS configured for origins: ${allowedOrigins.join(', ')}`);

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.warn(`⚠️  CORS blocked request from: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-organization-id', 'x-api-key'],
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Global pipes, filters, interceptors
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  // Swagger
  const swaggerConfig = new DocumentBuilder()
    .setTitle('AI Omnichannel CRM API')
    .setDescription('Multi-tenant CRM API with AI agent capabilities')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: 'x-organization-id' }, 'organization-id')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  // Connect RMQ microservice so @EventPattern consumers receive messages
  const rmqUrl = configService.get<string>('rabbitmq.url', 'amqp://guest:guest@localhost:5672');
  app.connectMicroservice({
    transport: Transport.RMQ,
    options: {
      urls: [rmqUrl],
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
  });
  await app.startAllMicroservices();

  await app.listen(port);
  console.log(`🚀 API running on http://localhost:${port} (routes: /api/v1/...)`);
  console.log(`📚 Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
