import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TopicsModule } from './topics/topics.module';
import { PublicModule } from './public/public.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [PrismaModule, AuthModule, TopicsModule, PublicModule, RealtimeModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
