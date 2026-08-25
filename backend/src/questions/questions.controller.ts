import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { QuestionsService } from './questions.service';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ApplySettingsToAllDto } from './dto/apply-settings-to-all.dto';

@Controller('questions')
@UseGuards(JwtAuthGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Get(':id')
  findOne(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.questionsService.findOne(id, user.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questionsService.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.questionsService.remove(id, user.id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.questionsService.duplicate(id, user.id);
  }

  @Post(':id/apply-settings-to-all')
  applySettingsToAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApplySettingsToAllDto,
  ) {
    return this.questionsService.applySettingsToAll(id, user.id, dto.groups);
  }

  @Post(':id/reveal-results')
  revealResults(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.questionsService.revealResults(id, user.id);
  }

  @Get(':id/wordcloud')
  getWordCloud(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.questionsService.getWordCloud(id, user.id);
  }

  @Delete(':id/responses')
  deleteResponses(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.questionsService.deleteResponses(id, user.id);
  }
}
