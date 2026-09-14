import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { join } from 'path';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Railway's network puts TWO hops between the real client and this app —
  // an edge layer and an internal router — each appending its own address to
  // X-Forwarded-For. With `trust proxy: 1`, Express returned the internal
  // router's address (which rotates across a pool per-connection) instead of
  // the client's, so IpRateLimitGuard never saw the same "IP" twice and never
  // throttled anyone. Confirmed via Railway HTTP/deploy logs: XFF arrived as
  // "<real client ip>, <rotating internal ip>" — trust proxy: 2 is needed to
  // walk back far enough to land on the real client IP.
  app.getHttpAdapter().getInstance().set('trust proxy', 2);

  app.useStaticAssets(join(__dirname, '..', '..', 'uploads'), {
    prefix: '/uploads/',
  });

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
