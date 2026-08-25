import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { PublicTopicsService } from './public-topics.service';
import { CreateResponseDto } from './dto/create-response.dto';
import { IpRateLimitGuard } from './ip-rate-limit.guard';

@Controller('public/questions')
export class PublicQuestionsController {
  constructor(private readonly publicTopicsService: PublicTopicsService) {}

  @Post(':questionId/responses')
  @UseGuards(IpRateLimitGuard)
  createResponse(@Param('questionId') questionId: string, @Body() dto: CreateResponseDto) {
    return this.publicTopicsService.createResponse(questionId, dto);
  }
}
