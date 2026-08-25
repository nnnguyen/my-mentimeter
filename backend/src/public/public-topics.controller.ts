import { Controller, Get, Param, Query } from '@nestjs/common';
import { PublicTopicsService } from './public-topics.service';

@Controller('public/topics')
export class PublicTopicsController {
  constructor(private readonly publicTopicsService: PublicTopicsService) {}

  @Get(':code')
  getTopic(
    @Param('code') code: string,
    @Query('participantSessionId') participantSessionId?: string,
  ) {
    return this.publicTopicsService.getPublicInfo(code, participantSessionId);
  }
}
