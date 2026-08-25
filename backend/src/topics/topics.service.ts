import {
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import * as QRCode from 'qrcode';
import { Topic } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WordCloudService, WordCloudSnapshot } from '../word-cloud/word-cloud.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

const CODE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const CODE_LENGTH = 6;
const MAX_CODE_ATTEMPTS = 5;

@Injectable()
export class TopicsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wordCloudService: WordCloudService,
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
        question: dto.question,
        maxWordsPerUser: dto.maxWordsPerUser,
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
    const voteUrl = `${process.env.FRONTEND_URL}/vote/${topic.code}`;
    return QRCode.toBuffer(voteUrl, { type: 'png' });
  }

  async getWordCloud(id: string, ownerId: string): Promise<WordCloudSnapshot> {
    await this.findOneForUser(id, ownerId);
    return this.wordCloudService.getSnapshot(id);
  }
}
