import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import { Topic } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WordCloudGateway } from '../realtime/word-cloud.gateway';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wordCloudGateway: WordCloudGateway,
  ) {}

  private async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        code += CODE_CHARS[randomInt(CODE_CHARS.length)];
      }
      const existing = await this.prisma.topic.findUnique({ where: { code } });
      if (!existing) {
        return code;
      }
    }
    throw new InternalServerErrorException('Không thể sinh mã topic, thử lại sau.');
  }

  async create(ownerId: string, dto: CreateTopicDto): Promise<Topic> {
    const code = await this.generateUniqueCode();
    return this.prisma.topic.create({
      data: {
        ownerId,
        title: dto.title,
        description: dto.description,
        code,
      },
    });
  }

  findAllForUser(ownerId: string): Promise<Topic[]> {
    return this.prisma.topic.findMany({
      where: { ownerId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneForUser(id: string, ownerId: string): Promise<Topic> {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) {
      throw new NotFoundException('Không tìm thấy topic.');
    }
    if (topic.ownerId !== ownerId) {
      throw new ForbiddenException('Bạn không có quyền truy cập topic này.');
    }
    return topic;
  }

  async update(id: string, ownerId: string, dto: UpdateTopicDto): Promise<Topic> {
    await this.findOneForUser(id, ownerId);
    return this.prisma.topic.update({ where: { id }, data: dto });
  }

  async remove(id: string, ownerId: string): Promise<Topic> {
    await this.findOneForUser(id, ownerId);
    return this.prisma.topic.delete({ where: { id } });
  }

  async generateQrCodePng(id: string, ownerId: string): Promise<Buffer> {
    const topic = await this.findOneForUser(id, ownerId);
    const joinUrl = `${process.env.FRONTEND_URL}/join/${topic.code}`;
    // Default QR generation is tiny (~1-2mm-per-module PNG) — bump the raster
    // size so it stays crisp when displayed larger on the present screen.
    return QRCode.toBuffer(joinUrl, { type: 'png', width: 512, margin: 2 });
  }

  async setCurrentQuestion(topicId: string, ownerId: string, questionId: string): Promise<Topic> {
    const existingTopic = await this.findOneForUser(topicId, ownerId);
    const question = await this.prisma.question.findUnique({ where: { id: questionId } });
    if (!question || question.topicId !== topicId) {
      throw new BadRequestException('Câu hỏi không thuộc topic này.');
    }

    const previousQuestionId = existingTopic.currentQuestionId;

    // Becoming the current question also opens it for responses, and moving
    // away from the previous one closes it — "current" and "open" are the
    // same concept from the audience's point of view (mục 3 CLAUDE.md).
    const [updatedQuestion, topic] = await this.prisma.$transaction(async (tx) => {
      if (previousQuestionId && previousQuestionId !== questionId) {
        await tx.question.updateMany({
          where: { id: previousQuestionId, status: 'ACTIVE' },
          data: { status: 'CLOSED' },
        });
      }
      const updatedQuestion = await tx.question.update({
        where: { id: questionId },
        data: { status: 'ACTIVE' },
      });
      const topic = await tx.topic.update({
        where: { id: topicId },
        data: { currentQuestionId: questionId },
      });
      return [updatedQuestion, topic] as const;
    });

    this.wordCloudGateway.broadcastQuestionChanged(topicId, updatedQuestion);
    return topic;
  }
}
