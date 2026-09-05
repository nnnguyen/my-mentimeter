import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TopicsService } from './topics.service';
import { PrismaService } from '../prisma/prisma.service';
import { WordCloudGateway } from '../realtime/word-cloud.gateway';

describe('TopicsService', () => {
  let service: TopicsService;
  let prisma: {
    topic: {
      findUnique: jest.Mock;
      create: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    question: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let wordCloudGateway: { broadcastQuestionChanged: jest.Mock };

  const ownerId = 'owner-1';
  const topic = {
    id: 'topic-1',
    ownerId,
    title: 'Chủ đề',
    description: 'Mô tả',
    code: 'ABC123',
    status: 'DRAFT',
    currentQuestionId: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      topic: {
        findUnique: jest.fn(),
        create: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      question: { findUnique: jest.fn() },
      $transaction: jest.fn(),
    };
    wordCloudGateway = { broadcastQuestionChanged: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TopicsService,
        { provide: PrismaService, useValue: prisma },
        { provide: WordCloudGateway, useValue: wordCloudGateway },
      ],
    }).compile();

    service = module.get(TopicsService);
  });

  describe('create', () => {
    it('retries code generation until a unique code is found', async () => {
      prisma.topic.findUnique
        .mockResolvedValueOnce(topic) // first generated code collides
        .mockResolvedValueOnce(null); // second generated code is free
      prisma.topic.create.mockResolvedValue(topic);

      const result = await service.create(ownerId, {
        title: topic.title,
        description: topic.description,
      });

      expect(prisma.topic.findUnique).toHaveBeenCalledTimes(2);
      expect(result).toEqual(topic);
    });
  });

  describe('findOneForUser', () => {
    it('throws NotFoundException when the topic does not exist', async () => {
      prisma.topic.findUnique.mockResolvedValue(null);
      await expect(service.findOneForUser('missing', ownerId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the topic belongs to another user', async () => {
      prisma.topic.findUnique.mockResolvedValue(topic);
      await expect(service.findOneForUser(topic.id, 'someone-else')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('returns the topic when the current user is the owner', async () => {
      prisma.topic.findUnique.mockResolvedValue(topic);
      await expect(service.findOneForUser(topic.id, ownerId)).resolves.toEqual(topic);
    });
  });

  describe('update / remove', () => {
    it('rejects update when the topic belongs to another user', async () => {
      prisma.topic.findUnique.mockResolvedValue(topic);
      await expect(
        service.update(topic.id, 'someone-else', { title: 'Hack' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.topic.update).not.toHaveBeenCalled();
    });

    it('rejects remove when the topic belongs to another user', async () => {
      prisma.topic.findUnique.mockResolvedValue(topic);
      await expect(service.remove(topic.id, 'someone-else')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.topic.delete).not.toHaveBeenCalled();
    });
  });

  describe('setCurrentQuestion', () => {
    const question = { id: 'question-1', topicId: topic.id, status: 'DRAFT' };

    it('rejects when the topic belongs to another user', async () => {
      prisma.topic.findUnique.mockResolvedValue(topic);
      await expect(
        service.setCurrentQuestion(topic.id, 'someone-else', question.id),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('rejects when the question does not belong to this topic', async () => {
      prisma.topic.findUnique.mockResolvedValue(topic);
      prisma.question.findUnique.mockResolvedValue({ id: question.id, topicId: 'other-topic' });
      await expect(service.setCurrentQuestion(topic.id, ownerId, question.id)).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('sets currentQuestionId and opens the new question for responses', async () => {
      prisma.topic.findUnique.mockResolvedValue(topic); // currentQuestionId: null
      prisma.question.findUnique.mockResolvedValue(question);

      const tx = {
        question: {
          updateMany: jest.fn(),
          update: jest.fn().mockResolvedValue({ ...question, status: 'ACTIVE' }),
        },
        topic: {
          update: jest.fn().mockResolvedValue({ ...topic, currentQuestionId: question.id }),
        },
      };
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

      const result = await service.setCurrentQuestion(topic.id, ownerId, question.id);

      expect(tx.question.updateMany).not.toHaveBeenCalled();
      expect(tx.question.update).toHaveBeenCalledWith({
        where: { id: question.id },
        data: { status: 'ACTIVE' },
      });
      expect(tx.topic.update).toHaveBeenCalledWith({
        where: { id: topic.id },
        data: { currentQuestionId: question.id },
      });
      expect(result.currentQuestionId).toBe(question.id);
      expect(wordCloudGateway.broadcastQuestionChanged).toHaveBeenCalledWith(topic.id, {
        ...question,
        status: 'ACTIVE',
      });
    });

    it('closes the previously current question when switching to a different one', async () => {
      const topicWithCurrent = { ...topic, currentQuestionId: 'question-0' };
      prisma.topic.findUnique.mockResolvedValue(topicWithCurrent);
      prisma.question.findUnique.mockResolvedValue(question);

      const tx = {
        question: {
          updateMany: jest.fn(),
          update: jest.fn().mockResolvedValue({ ...question, status: 'ACTIVE' }),
        },
        topic: {
          update: jest
            .fn()
            .mockResolvedValue({ ...topicWithCurrent, currentQuestionId: question.id }),
        },
      };
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

      await service.setCurrentQuestion(topic.id, ownerId, question.id);

      expect(tx.question.updateMany).toHaveBeenCalledWith({
        where: { id: 'question-0', status: 'ACTIVE' },
        data: { status: 'CLOSED' },
      });
    });
  });
});
