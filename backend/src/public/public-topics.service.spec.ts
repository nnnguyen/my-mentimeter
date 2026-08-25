import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PublicTopicsService } from './public-topics.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PublicTopicsService', () => {
  let service: PublicTopicsService;
  let prisma: {
    topic: { findUnique: jest.Mock };
    response: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: { response: { create: jest.Mock }; wordAggregate: { upsert: jest.Mock } };

  const activeTopic = {
    id: 'topic-1',
    code: 'ABC123',
    title: 'Chủ đề',
    question: 'Bạn nghĩ gì?',
    status: 'ACTIVE',
    maxWordsPerUser: 2,
  };

  beforeEach(async () => {
    tx = {
      response: { create: jest.fn() },
      wordAggregate: { upsert: jest.fn() },
    };
    prisma = {
      topic: { findUnique: jest.fn() },
      response: { count: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [PublicTopicsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(PublicTopicsService);
  });

  describe('getPublicInfo', () => {
    it('throws NotFoundException when the topic does not exist', async () => {
      prisma.topic.findUnique.mockResolvedValue(null);
      await expect(service.getPublicInfo('MISSING')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns only the public-safe fields', async () => {
      prisma.topic.findUnique.mockResolvedValue(activeTopic);
      await expect(service.getPublicInfo('ABC123')).resolves.toEqual({
        title: activeTopic.title,
        question: activeTopic.question,
        status: activeTopic.status,
        maxWordsPerUser: activeTopic.maxWordsPerUser,
      });
    });
  });

  describe('createResponse', () => {
    const dto = { text: 'Sáng tạo', participantSessionId: '11111111-1111-1111-1111-111111111111' };

    it('throws NotFoundException when the topic does not exist', async () => {
      prisma.topic.findUnique.mockResolvedValue(null);
      await expect(service.createResponse('MISSING', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException when the topic is not ACTIVE', async () => {
      prisma.topic.findUnique.mockResolvedValue({ ...activeTopic, status: 'DRAFT' });
      await expect(service.createResponse('ABC123', dto)).rejects.toBeInstanceOf(ConflictException);
    });

    it('throws 429 when the participant already used up their word quota', async () => {
      prisma.topic.findUnique.mockResolvedValue(activeTopic);
      prisma.response.count.mockResolvedValue(2); // maxWordsPerUser is 2
      const promise = service.createResponse('ABC123', dto);
      await expect(promise).rejects.toBeInstanceOf(HttpException);
      await promise.catch((err: HttpException) => {
        expect(err.getStatus()).toBe(429);
      });
    });

    it('throws BadRequestException when the text is empty after normalization', async () => {
      prisma.topic.findUnique.mockResolvedValue(activeTopic);
      prisma.response.count.mockResolvedValue(0);
      await expect(
        service.createResponse('ABC123', { ...dto, text: '!!!' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates the Response and upserts the WordAggregate on success', async () => {
      prisma.topic.findUnique.mockResolvedValue(activeTopic);
      prisma.response.count.mockResolvedValue(0);

      const result = await service.createResponse('ABC123', dto);

      expect(tx.response.create).toHaveBeenCalledWith({
        data: {
          topicId: activeTopic.id,
          rawText: 'Sáng tạo',
          normalizedText: 'sáng tạo',
          participantSessionId: dto.participantSessionId,
        },
      });
      expect(tx.wordAggregate.upsert).toHaveBeenCalledWith({
        where: { topicId_normalizedText: { topicId: activeTopic.id, normalizedText: 'sáng tạo' } },
        update: { count: { increment: 1 } },
        create: {
          topicId: activeTopic.id,
          normalizedText: 'sáng tạo',
          displayText: 'Sáng tạo',
          count: 1,
        },
      });
      expect(result).toEqual({ submittedCount: 1, maxWordsPerUser: 2 });
    });
  });
});
