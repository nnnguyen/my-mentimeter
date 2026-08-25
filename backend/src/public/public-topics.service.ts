import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { normalizeWord, sanitizeDisplayText } from '../common/normalize-word';
import { WordCloudGateway } from '../realtime/word-cloud.gateway';
import { CreateResponseDto } from './dto/create-response.dto';

export interface PublicTopicInfo {
  title: string;
  question: string;
  status: string;
  maxWordsPerUser: number;
}

export interface CreateResponseResult {
  submittedCount: number;
  maxWordsPerUser: number;
}

@Injectable()
export class PublicTopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wordCloudGateway: WordCloudGateway,
  ) {}

  async getPublicInfo(code: string): Promise<PublicTopicInfo> {
    const topic = await this.prisma.topic.findUnique({ where: { code } });
    if (!topic) {
      throw new NotFoundException('Không tìm thấy topic.');
    }
    return {
      title: topic.title,
      question: topic.question,
      status: topic.status,
      maxWordsPerUser: topic.maxWordsPerUser,
    };
  }

  async createResponse(code: string, dto: CreateResponseDto): Promise<CreateResponseResult> {
    const topic = await this.prisma.topic.findUnique({ where: { code } });
    if (!topic) {
      throw new NotFoundException('Không tìm thấy topic.');
    }
    if (topic.status !== 'ACTIVE') {
      throw new ConflictException('Topic hiện không mở để nhận câu trả lời.');
    }

    const existingCount = await this.prisma.response.count({
      where: { topicId: topic.id, participantSessionId: dto.participantSessionId },
    });
    if (existingCount >= topic.maxWordsPerUser) {
      throw new HttpException('Bạn đã gửi đủ số từ cho phép.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const normalizedText = normalizeWord(dto.text);
    if (!normalizedText) {
      throw new BadRequestException('Từ không hợp lệ.');
    }
    const displayText = sanitizeDisplayText(dto.text);

    await this.prisma.$transaction(async (tx) => {
      await tx.response.create({
        data: {
          topicId: topic.id,
          rawText: dto.text,
          normalizedText,
          participantSessionId: dto.participantSessionId,
        },
      });
      await tx.wordAggregate.upsert({
        where: { topicId_normalizedText: { topicId: topic.id, normalizedText } },
        update: { count: { increment: 1 } },
        create: {
          topicId: topic.id,
          normalizedText,
          displayText,
          count: 1,
        },
      });
    });

    await this.wordCloudGateway.broadcastSnapshot(topic.id);

    return { submittedCount: existingCount + 1, maxWordsPerUser: topic.maxWordsPerUser };
  }
}
