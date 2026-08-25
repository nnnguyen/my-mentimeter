import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TopicsService } from './topics.service';
import { PrismaService } from '../prisma/prisma.service';

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
  };

  const ownerId = 'owner-1';
  const topic = {
    id: 'topic-1',
    ownerId,
    title: 'Chủ đề',
    question: 'Bạn nghĩ gì?',
    code: 'ABC123',
    status: 'DRAFT',
    maxWordsPerUser: 3,
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
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TopicsService, { provide: PrismaService, useValue: prisma }],
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
        question: topic.question,
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
});
