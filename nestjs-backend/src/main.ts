import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import * as bodyParser from 'body-parser';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/** Global prefix for every REST route. Twilio's media stream (/audio-stream) is outside it. */
export const API_PREFIX = 'api';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.enableShutdownHooks();

  // Stripe verifies the webhook signature against the exact bytes it sent, so
  // that route must receive the raw body, not parsed JSON.
  app.use(`/${API_PREFIX}/billing/webhook`, bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  // FRONTEND_URL covers the direct dev origin; ALLOWED_ORIGINS adds any others
  // (e.g. the nginx origin on :80, or a white-label custom domain).
  const allowedOrigins = [
    config.get<string>('FRONTEND_URL', 'http://localhost:3000'),
    ...config.get<string>('ALLOWED_ORIGINS', '').split(',').map(o => o.trim()).filter(Boolean),
  ];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.setGlobalPrefix(API_PREFIX);

  const port = config.get<number>('PORT', 3001);
  await app.listen(port);
  logger.log(`Backend running on http://localhost:${port}/${API_PREFIX}`);
}

bootstrap().catch(err => {
  // Most often an invalid .env (see config/env.validation.ts) or an unreachable database.
  new Logger('Bootstrap').error(err?.message ?? err, err?.stack);
  process.exit(1);
});
