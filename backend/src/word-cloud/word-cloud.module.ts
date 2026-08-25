import { Module } from '@nestjs/common';
import { WordCloudService } from './word-cloud.service';

@Module({
  providers: [WordCloudService],
  exports: [WordCloudService],
})
export class WordCloudModule {}
