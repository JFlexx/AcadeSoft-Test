import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Trust the first reverse proxy (Render/Railway/Nginx) so the rate limiter
  // and any IP-based logic see the real client IP from X-Forwarded-For.
  app.set('trust proxy', 1);

  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN'),
    credentials: true,
  });
  app.use(cookieParser(config.get<string>('COOKIE_SECRET')));
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = config.get<number>('API_PORT', 3001);
  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

bootstrap();
