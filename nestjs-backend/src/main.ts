import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.enableShutdownHooks();
  app.use('/api/billing/webhook', bodyParser.raw({ type: 'application/json' }));
  app.use(bodyParser.json({ limit: '50mb' }));
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
  // FRONTEND_URL covers the direct dev origin; ALLOWED_ORIGINS adds any others
  // (e.g. the nginx origin on :80, or a white-label custom domain).
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    ...(process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean),
  ];
  app.enableCors({
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.setGlobalPrefix('api');
  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend running on http://localhost:${port}`);
}
bootstrap();
