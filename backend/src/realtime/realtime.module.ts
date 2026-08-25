import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { WordCloudGateway } from './word-cloud.gateway';
import { AudienceGateway } from './audience.gateway';
import { WordCloudModule } from '../word-cloud/word-cloud.module';

@Module({
  imports: [JwtModule.register({ secret: process.env.JWT_SECRET }), WordCloudModule],
  providers: [WordCloudGateway, AudienceGateway],
  exports: [WordCloudGateway, AudienceGateway],
})
export class RealtimeModule {}
