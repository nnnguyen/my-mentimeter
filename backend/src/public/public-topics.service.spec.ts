import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PublicTopicsService } from './public-topics.service';
import { PrismaService } from '../prisma/prisma.service';
import { WordCloudGateway } from '../realtime/word-cloud.gateway';

describe('PublicTopicsService', () => {
  let service: PublicTopicsService;
  let prisma: {
    topic: { findUnique: jest.Mock };
    question: { findUnique: jest.Mock };
    response: { count: jest.Mock; findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let tx: { response: { create: jest.Mock }; wordAggregate: { upsert: jest.Mock } };
  let wordCloudGateway: { broadcastSnapshot: jest.Mock };

  const activeTopic = {
    id: 'topic-1',
    code: 'ABC123',
    title: 'Chủ đề',
    status: 'ACTIVE',
    currentQuestionId: 'question-1',
  };

  const activeQuestion = {
    id: 'question-1',
    topicId: 'topic-1',
    prompt: 'Bạn nghĩ gì?',
    status: 'ACTIVE',
    responseLimit: 2,
    maxWordLength: 40,
    allowDuplicateFromSameUser: false,
    showResultsToAudience: false,
  };

  beforeEach(async () => {
    tx = {
      response: { create: jest.fn() },
      wordAggregate: { upsert: jest.fn() },
    };
    prisma = {
      topic: { findUnique: jest.fn() },
      question: { findUnique: jest.fn() },
      response: { count: jest.fn(), findFirst: jest.fn() },
      $transaction: jest.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    wordCloudGateway = { broadcastSnapshot: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicTopicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WordCloudGateway, useValue: wordCloudGateway },
      ],
    }).compile();

    service = module.get(PublicTopicsService);
  });

  describe('getPublicInfo', () => {
    it('throws NotFoundException when the topic does not exist', async () => {
      prisma.topic.findUnique.mockResolvedValue(null);
      await expect(service.getPublicInfo('MISSING')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns currentQuestion: null when the topic has no current question', async () => {
      prisma.topic.findUnique.mockResolvedValue({ ...activeTopic, currentQuestionId: null });
      await expect(service.getPublicInfo('ABC123')).resolves.toEqual({
        topicTitle: activeTopic.title,
        status: activeTopic.status,
        currentQuestion: null,
      });
    });

    it('returns the public-safe fields of the current question', async () => {
      prisma.topic.findUnique.mockResolvedValue(activeTopic);
      prisma.question.findUnique.mockResolvedValue(activeQuestion);
      prisma.response.count.mockResolvedValue(0);

      await expect(service.getPublicInfo('ABC123')).resolves.toEqual({
        topicTitle: activeTopic.title,
        status: activeTopic.status,
        currentQuestion: {
          id: activeQuestion.id,
          prompt: activeQuestion.prompt,
          status: activeQuestion.status,
          config: {
            responseLimit: activeQuestion.responseLimit,
            maxWordLength: activeQuestion.maxWordLength,
            allowDuplicateFromSameUser: activeQuestion.allowDuplicateFromSameUser,
            showResultsToAudience: activeQuestion.showResultsToAudience,
          },
          myResponseCount: 0,
        },
      });
    });

    it('computes myResponseCount from the given participantSessionId', async () => {
      prisma.topic.findUnique.mockResolvedValue(activeTopic);
      prisma.question.findUnique.mockResolvedValue(activeQuestion);
      prisma.response.count.mockResolvedValue(3);

      const result = await service.getPublicInfo('ABC123', 'participant-1');

      expect(prisma.response.count).toHaveBeenCalledWith({
        where: { questionId: activeQuestion.id, participantSessionId: 'participant-1' },
      });
      expect(result.currentQuestion?.myResponseCount).toBe(3);
    });
  });

  describe('createResponse', () => {
    const dto = { text: 'Sáng tạo', participantSessionId: '11111111-1111-1111-1111-111111111111' };

    it('throws NotFoundException when the question does not exist', async () => {
      prisma.question.findUnique.mockResolvedValue(null);
      await expect(service.createResponse('question-1', dto)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ConflictException when the question is not ACTIVE', async () => {
      prisma.question.findUnique.mockResolvedValue({ ...activeQuestion, status: 'DRAFT' });
      await expect(service.createResponse('question-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('throws 429 when the participant already used up their word quota', async () => {
      prisma.question.findUnique.mockResolvedValue(activeQuestion);
      prisma.response.count.mockResolvedValue(2); // responseLimit is 2
      const promise = service.createResponse('question-1', dto);
      await expect(promise).rejects.toBeInstanceOf(HttpException);
      await promise.catch((err: HttpException) => {
        expect(err.getStatus()).toBe(429);
      });
    });

    it('throws BadRequestException when the text is empty after normalization', async () => {
      prisma.question.findUnique.mockResolvedValue(activeQuestion);
      prisma.response.count.mockResolvedValue(0);
      await expect(
        service.createResponse('question-1', { ...dto, text: '!!!' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the same word was already submitted and duplicates are disallowed', async () => {
      prisma.question.findUnique.mockResolvedValue(activeQuestion); // allowDuplicateFromSameUser: false
      prisma.response.count.mockResolvedValue(0);
      prisma.response.findFirst.mockResolvedValue({ id: 'existing-response' });

      await expect(service.createResponse('question-1', dto)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.response.findFirst).toHaveBeenCalledWith({
        where: {
          questionId: activeQuestion.id,
          participantSessionId: dto.participantSessionId,
          normalizedText: 'sáng tạo',
        },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('allows a duplicate word from the same participant when allowDuplicateFromSameUser is true', async () => {
      prisma.question.findUnique.mockResolvedValue({
        ...activeQuestion,
        allowDuplicateFromSameUser: true,
      });
      prisma.response.count.mockResolvedValue(0);

      await service.createResponse('question-1', dto);

      expect(prisma.response.findFirst).not.toHaveBeenCalled();
      expect(tx.response.create).toHaveBeenCalled();
    });

    it('creates the Response and upserts the WordAggregate on success', async () => {
      prisma.question.findUnique.mockResolvedValue(activeQuestion);
      prisma.response.count.mockResolvedValue(0);
      prisma.response.findFirst.mockResolvedValue(null);

      const result = await service.createResponse('question-1', dto);

      expect(tx.response.create).toHaveBeenCalledWith({
        data: {
          questionId: activeQuestion.id,
          rawText: 'Sáng tạo',
          normalizedText: 'sáng tạo',
          participantSessionId: dto.participantSessionId,
        },
      });
      expect(tx.wordAggregate.upsert).toHaveBeenCalledWith({
        where: {
          questionId_normalizedText: { questionId: activeQuestion.id, normalizedText: 'sáng tạo' },
        },
        update: { count: { increment: 1 } },
        create: {
          questionId: activeQuestion.id,
          normalizedText: 'sáng tạo',
          displayText: 'Sáng tạo',
          count: 1,
        },
      });
      expect(result).toEqual({ submittedCount: 1, responseLimit: 2 });
      expect(wordCloudGateway.broadcastSnapshot).toHaveBeenCalledWith(
        activeQuestion.topicId,
        activeQuestion.id,
      );
    });

    it('does not broadcast when the submission is rejected', async () => {
      prisma.question.findUnique.mockResolvedValue(activeQuestion);
      prisma.response.count.mockResolvedValue(0);
      await service.createResponse('question-1', { ...dto, text: '!!!' }).catch(() => undefined);
      expect(wordCloudGateway.broadcastSnapshot).not.toHaveBeenCalled();
    });

    it('never blocks on quota when responseLimit is null (unlimited)', async () => {
      const unlimitedQuestion = { ...activeQuestion, responseLimit: null };
      prisma.question.findUnique.mockResolvedValue(unlimitedQuestion);
      prisma.response.count.mockResolvedValue(9999); // way past any normal limit
      prisma.response.findFirst.mockResolvedValue(null);

      const result = await service.createResponse('question-1', dto);

      expect(result).toEqual({ submittedCount: 10000, responseLimit: null });
    });
  });
});
