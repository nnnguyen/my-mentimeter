import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/strategies/jwt.strategy';
import { QuestionsService } from './questions.service';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ApplySettingsToAllDto } from './dto/apply-settings-to-all.dto';
import { ApplySettingsToOthersDto } from './dto/apply-settings-to-others.dto';

@Controller('questions')
@UseGuards(JwtAuthGuard)
export class QuestionsController {
  constructor(private readonly questionsService: QuestionsService) {}

  @Post('upload-logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const randomName = Array(32)
            .fill(null)
            .map(() => Math.round(Math.random() * 16).toString(16))
            .join('');
          cb(null, `${randomName}${extname(file.originalname)}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    }),
  )
  uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return {
      url: `/uploads/${file.filename}`,
    };
  }

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

  @Post(':id/apply-settings-to-others')
  applySettingsToOthers(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApplySettingsToOthersDto,
  ) {
    return this.questionsService.applySettingsToOthers(id, user.id, dto);
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
