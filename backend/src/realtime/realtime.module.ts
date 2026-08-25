import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WordCloudGateway } from './word-cloud.gateway';
import { TopicsModule } from '../topics/topics.module';
import { WordCloudModule } from '../word-cloud/word-cloud.module';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET }), TopicsModule, WordCloudModule],
  providers: [WordCloudGateway],
  exports: [WordCloudGateway],
})
export class RealtimeModule {}
