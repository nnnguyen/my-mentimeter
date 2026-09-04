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

export interface PublicQuestionConfig {
  responseLimit: number | null;
  maxWordLength: number;
  allowDuplicateFromSameUser: boolean;
  showResultsToAudience: boolean;
}

export interface PublicCurrentQuestion {
  id: string;
  prompt: string;
  status: string;
  config: PublicQuestionConfig;
  myResponseCount: number;
}

export interface PublicTopicInfo {
  topicTitle: string;
  status: string;
  currentQuestion: PublicCurrentQuestion | null;
}

export interface CreateResponseResult {
  submittedCount: number;
  responseLimit: number | null;
}

@Injectable()
export class PublicTopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wordCloudGateway: WordCloudGateway,
  ) {}

  async getPublicInfo(code: string, participantSessionId?: string): Promise<PublicTopicInfo> {
    const topic = await this.prisma.topic.findUnique({ where: { code } });
    if (!topic) {
      throw new NotFoundException('Không tìm thấy topic.');
    }

    if (!topic.currentQuestionId) {
      return { topicTitle: topic.title, status: topic.status, currentQuestion: null };
    }

    const question = await this.prisma.question.findUnique({
      where: { id: topic.currentQuestionId },
    });
    if (!question) {
      return { topicTitle: topic.title, status: topic.status, currentQuestion: null };
    }

    const myResponseCount = participantSessionId
      ? await this.prisma.response.count({
          where: { questionId: question.id, participantSessionId },
        })
      : 0;

    return {
      topicTitle: topic.title,
      status: topic.status,
      currentQuestion: {
        id: question.id,
        prompt: question.prompt,
        status: question.status,
        config: {
          responseLimit: question.responseLimit,
          maxWordLength: question.maxWordLength,
          allowDuplicateFromSameUser: question.allowDuplicateFromSameUser,
          showResultsToAudience: question.showResultsToAudience,
        },
        myResponseCount,
      },
    };
  }

  async createResponse(questionId: string, dto: CreateResponseDto): Promise<CreateResponseResult> {
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question) {
      throw new NotFoundException('Không tìm thấy câu hỏi.');
    }
    if (question.status !== 'ACTIVE') {
      throw new ConflictException('Câu hỏi hiện không được kích hoạt để nhận câu trả lời.');
    }

    const existingCount = await this.prisma.response.count({
      where: { questionId, participantSessionId: dto.participantSessionId },
    });
    if (question.responseLimit !== null && existingCount >= question.responseLimit) {
      throw new HttpException('Bạn đã gửi đủ số từ cho phép.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const normalizedText = normalizeWord(dto.text, question.maxWordLength);
    if (!normalizedText) {
      throw new BadRequestException('Từ không hợp lệ.');
    }
    const displayText = sanitizeDisplayText(dto.text, question.maxWordLength);

    if (!question.allowDuplicateFromSameUser) {
      const duplicate = await this.prisma.response.findFirst({
        where: { questionId, participantSessionId: dto.participantSessionId, normalizedText },
      });
      if (duplicate) {
        throw new ConflictException('Bạn đã gửi từ này rồi.');
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.response.create({
        data: {
          questionId,
          rawText: dto.text,
          normalizedText,
          participantSessionId: dto.participantSessionId,
        },
      });
      await tx.wordAggregate.upsert({
        where: { questionId_normalizedText: { questionId, normalizedText } },
        update: { count: { increment: 1 } },
        create: {
          questionId,
          normalizedText,
          displayText,
          count: 1,
        },
      });
    });

    await this.wordCloudGateway.broadcastSnapshot(question.topicId, questionId);

    return { submittedCount: existingCount + 1, responseLimit: question.responseLimit };
  }
}
