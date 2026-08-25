import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
