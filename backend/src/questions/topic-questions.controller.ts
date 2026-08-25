import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { QuestionsService } from './questions.service';
import { CreateQuestionDto } from './dto/create-question.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';

@Controller('topics/:topicId/questions')
@UseGuards(JwtAuthGuard)
export class TopicQuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('topicId') topicId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.questionsService.create(topicId, user.id, dto);
  }

  @Get()
  findAll(@CurrentUser() user: AuthenticatedUser, @Param('topicId') topicId: string) {
    return this.questionsService.findAllForTopic(topicId, user.id);
  }

  @Patch('reorder')
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('topicId') topicId: string,
    @Body() dto: ReorderQuestionsDto,
  ) {
    return this.questionsService.reorder(topicId, user.id, dto.orderedIds);
  }
}
