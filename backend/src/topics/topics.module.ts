import { Module } from '@nestjs/common';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [TopicsController],
  providers: [TopicsService],
  exports: [TopicsService],
})
export class TopicsModule {}
