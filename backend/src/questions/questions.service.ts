import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Question } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TopicsService } from '../topics/topics.service';
import { WordCloudService, WordCloudSnapshot } from '../word-cloud/word-cloud.service';
import { WordCloudGateway } from '../realtime/word-cloud.gateway';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ApplySettingsToOthersDto } from './dto/apply-settings-to-others.dto';
import { ApplySettingsGroup } from './dto/apply-settings-to-all.dto';

const APPLY_SETTINGS_FIELDS: (keyof Question)[] = [
  'responseLimit',
  'maxWordLength',
  'allowDuplicateFromSameUser',
  'backgroundColor',
  'questionColor',
  'textColorScheme',
  'showLogo',
  'logoUrl',
  'maxWordsDisplayed',
  'showJoiningInfo',
  'joiningInfoType',
  'resultVisibility',
  'showResultsToAudience',
];

const APPLY_SETTINGS_GROUP_FIELDS: Record<ApplySettingsGroup, (keyof Question)[]> = {
  [ApplySettingsGroup.JOINING]: ['showJoiningInfo', 'joiningInfoType'],
  [ApplySettingsGroup.SHOW_RESPONSES]: ['resultVisibility'],
};

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly topicsService: TopicsService,
    private readonly wordCloudService: WordCloudService,
    private readonly wordCloudGateway: WordCloudGateway,
  ) {}

  private async nextOrder(topicId: string): Promise<number> {
    const result = await this.prisma.question.aggregate({
      where: { topicId },
      _max: { order: true },
    });
    return (result._max.order ?? 0) + 1;
  }

  private async requireOwnedQuestion(id: string, ownerId: string): Promise<Question> {
    const question = await this.prisma.question.findUnique({ where: { id } });
    if (!question) {
      throw new NotFoundException('Không tìm thấy câu hỏi.');
    }
    // Ownership is checked through the parent topic — a Question has no owner of its own.
    await this.topicsService.findOneForUser(question.topicId, ownerId);
    return question;
  }

  async create(topicId: string, ownerId: string, dto: CreateQuestionDto): Promise<Question> {
    await this.topicsService.findOneForUser(topicId, ownerId);
    const order = await this.nextOrder(topicId);

    // Get the first question of this topic to copy its config
    const firstQuestion = await this.prisma.question.findFirst({
      where: { topicId },
      orderBy: { order: 'asc' },
    });

    const data: any = {
      topicId,
      order,
      prompt: dto.prompt ?? '',
    };

    if (firstQuestion) {
      for (const field of APPLY_SETTINGS_FIELDS) {
        data[field] = (firstQuestion as any)[field];
      }
    }

    return this.prisma.question.create({
      data,
    });
  }

  async findAllForTopic(topicId: string, ownerId: string): Promise<Question[]> {
    await this.topicsService.findOneForUser(topicId, ownerId);
    return this.prisma.question.findMany({ where: { topicId }, orderBy: { order: 'asc' } });
  }

  findOne(id: string, ownerId: string): Promise<Question> {
    return this.requireOwnedQuestion(id, ownerId);
  }

  async update(id: string, ownerId: string, dto: UpdateQuestionDto): Promise<Question> {
    await this.requireOwnedQuestion(id, ownerId);
    return this.prisma.question.update({ where: { id }, data: dto });
  }

  async remove(id: string, ownerId: string): Promise<Question> {
    const question = await this.requireOwnedQuestion(id, ownerId);
    const { topicId } = question;

    await this.prisma.$transaction(async (tx) => {
      await tx.question.delete({ where: { id } });
      await tx.topic.updateMany({
        where: { id: topicId, currentQuestionId: id },
        data: { currentQuestionId: null },
      });

      const remaining = await tx.question.findMany({
        where: { topicId },
        orderBy: { order: 'asc' },
      });
      for (let i = 0; i < remaining.length; i++) {
        const desiredOrder = i + 1;
        if (remaining[i].order !== desiredOrder) {
          await tx.question.update({
            where: { id: remaining[i].id },
            data: { order: desiredOrder },
          });
        }
      }
    });

    return question;
  }

  async reorder(topicId: string, ownerId: string, orderedIds: string[]): Promise<Question[]> {
    await this.topicsService.findOneForUser(topicId, ownerId);

    const existing = await this.prisma.question.findMany({
      where: { topicId },
      select: { id: true },
    });
    const existingIds = new Set(existing.map((q) => q.id));
    const isSameSet =
      orderedIds.length === existingIds.size && orderedIds.every((id) => existingIds.has(id));
    if (!isSameSet) {
      throw new BadRequestException('Danh sách câu hỏi không khớp với topic.');
    }

    // Two-phase update: negative temp orders first, avoids violating the
    // @@unique([topicId, order]) constraint when swapping positions.
    await this.prisma.$transaction([
      ...orderedIds.map((id, index) =>
        this.prisma.question.update({ where: { id }, data: { order: -(index + 1) } }),
      ),
      ...orderedIds.map((id, index) =>
        this.prisma.question.update({ where: { id }, data: { order: index + 1 } }),
      ),
    ]);

    return this.prisma.question.findMany({ where: { topicId }, orderBy: { order: 'asc' } });
  }

  async duplicate(id: string, ownerId: string): Promise<Question> {
    const question = await this.requireOwnedQuestion(id, ownerId);
    const order = await this.nextOrder(question.topicId);

    return this.prisma.question.create({
      data: {
        prompt: question.prompt,
        type: question.type,
        responseLimit: question.responseLimit,
        maxWordLength: question.maxWordLength,
        allowDuplicateFromSameUser: question.allowDuplicateFromSameUser,
        backgroundColor: question.backgroundColor,
        textColorScheme: question.textColorScheme,
        showLogo: question.showLogo,
        maxWordsDisplayed: question.maxWordsDisplayed,
        showJoiningInfo: question.showJoiningInfo,
        joiningInfoType: question.joiningInfoType,
        resultVisibility: question.resultVisibility,
        showResultsToAudience: question.showResultsToAudience,
        topicId: question.topicId,
        order,
        status: 'DRAFT',
        resultsRevealed: false,
      },
    });
  }

  async applySettingsToAll(
    id: string,
    ownerId: string,
    groups: ApplySettingsGroup[],
  ): Promise<{ updatedCount: number }> {
    const question = await this.requireOwnedQuestion(id, ownerId);

    const data: Record<string, unknown> = {};
    for (const group of groups) {
      for (const field of APPLY_SETTINGS_GROUP_FIELDS[group]) {
        data[field] = question[field];
      }
    }

    const result = await this.prisma.question.updateMany({
      where: { topicId: question.topicId },
      data,
    });
    return { updatedCount: result.count };
  }

  async applySettingsToOthers(
    id: string,
    ownerId: string,
    dto: ApplySettingsToOthersDto,
  ): Promise<{ updatedCount: number }> {
    const question = await this.requireOwnedQuestion(id, ownerId);

    const data: Record<string, unknown> = {};
    for (const field of APPLY_SETTINGS_FIELDS) {
      data[field] = (question as any)[field];
    }

    const where: any = {
      topicId: question.topicId,
      id: { not: id },
    };

    if (!dto.applyToAll && dto.targetQuestionIds) {
      where.id = { in: dto.targetQuestionIds };
    }

    const result = await this.prisma.question.updateMany({
      where,
      data,
    });
    return { updatedCount: result.count };
  }

  async revealResults(id: string, ownerId: string): Promise<Question> {
    const question = await this.requireOwnedQuestion(id, ownerId);
    if (question.resultVisibility !== 'ON_CLICK') {
      throw new ConflictException('Chỉ áp dụng khi resultVisibility = ON_CLICK.');
    }

    const updated = await this.prisma.question.update({
      where: { id },
      data: { resultsRevealed: true },
    });
    await this.wordCloudGateway.broadcastResultsRevealed(question.topicId, id);
    return updated;
  }

  async getWordCloud(id: string, ownerId: string): Promise<WordCloudSnapshot> {
    await this.requireOwnedQuestion(id, ownerId);
    return this.wordCloudService.getSnapshot(id);
  }

  async deleteResponses(id: string, ownerId: string): Promise<{ ok: true }> {
    const question = await this.requireOwnedQuestion(id, ownerId);
    await this.prisma.$transaction([
      this.prisma.response.deleteMany({ where: { questionId: id } }),
      this.prisma.wordAggregate.deleteMany({ where: { questionId: id } }),
    ]);
    await this.wordCloudGateway.broadcastSnapshot(question.topicId, id);
    return { ok: true };
  }
}
