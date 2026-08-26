import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Behind Railway's (or any) reverse proxy, req.ip is the proxy's own
  // address unless we trust the X-Forwarded-For header — without this the
  // per-IP rate limiter (IpRateLimitGuard) would see every request as coming
  // from the same IP and throttle all users combined, not per person.
  app.getHttpAdapter().getInstance().set('trust proxy', 1);
  app.use(cookieParser());
  const origins = process.env.FRONTEND_URL?.split(',') ?? [];
  app.enableCors({
    origin: origins,
    credentials: true,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
