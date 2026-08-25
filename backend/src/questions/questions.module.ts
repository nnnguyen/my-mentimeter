import { Module } from '@nestjs/common';
import { TopicQuestionsController } from './topic-questions.controller';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';
import { TopicsModule } from '../topics/topics.module';
import { WordCloudModule } from '../word-cloud/word-cloud.module';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [TopicsModule, WordCloudModule, RealtimeModule],
  controllers: [TopicQuestionsController, QuestionsController],
  providers: [QuestionsService],
  exports: [QuestionsService],
})
export class QuestionsModule {}
