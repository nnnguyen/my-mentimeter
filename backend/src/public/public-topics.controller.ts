import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PublicTopicsService } from './public-topics.service';
import { CreateResponseDto } from './dto/create-response.dto';
import { IpRateLimitGuard } from './ip-rate-limit.guard';

@Controller('public/topics')
export class PublicTopicsController {
  constructor(private readonly publicTopicsService: PublicTopicsService) {}

  @Get(':code')
  getTopic(@Param('code') code: string) {
    return this.publicTopicsService.getPublicInfo(code);
  }

  @Post(':code/responses')
  @UseGuards(IpRateLimitGuard)
  createResponse(@Param('code') code: string, @Body() dto: CreateResponseDto) {
    return this.publicTopicsService.createResponse(code, dto);
  }
}
