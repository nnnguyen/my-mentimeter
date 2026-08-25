import { Module } from '@nestjs/common';
import { PublicTopicsController } from './public-topics.controller';
import { PublicTopicsService } from './public-topics.service';
import { IpRateLimitGuard } from './ip-rate-limit.guard';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [PublicTopicsController],
  providers: [PublicTopicsService, IpRateLimitGuard],
})
export class PublicModule {}
