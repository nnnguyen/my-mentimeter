import { Test, TestingModule } from '@nestjs/testing';
import { WordCloudService } from './word-cloud.service';
import { PrismaService } from '../prisma/prisma.service';

describe('WordCloudService', () => {
  let service: WordCloudService;
  let prisma: {
    wordAggregate: { findMany: jest.Mock };
    response: { count: jest.Mock; groupBy: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      wordAggregate: { findMany: jest.fn() },
      response: { count: jest.fn(), groupBy: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [WordCloudService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(WordCloudService);
  });

  it('returns words sorted by count desc (delegated to the DB query), totalResponses, uniqueWords, and uniqueParticipants', async () => {
    const words = [
      { displayText: 'sáng tạo', count: 5 },
      { displayText: 'học tập', count: 2 },
    ];
    prisma.wordAggregate.findMany.mockResolvedValue(words);
    prisma.response.count.mockResolvedValue(9);
    prisma.response.groupBy.mockResolvedValue([
      { participantSessionId: 'a' },
      { participantSessionId: 'b' },
      { participantSessionId: 'c' },
    ]);

    const result = await service.getSnapshot('question-1');

    expect(prisma.wordAggregate.findMany).toHaveBeenCalledWith({
      where: { questionId: 'question-1' },
      orderBy: { count: 'desc' },
      select: { displayText: true, count: true },
    });
    expect(prisma.response.count).toHaveBeenCalledWith({ where: { questionId: 'question-1' } });
    expect(prisma.response.groupBy).toHaveBeenCalledWith({
      by: ['participantSessionId'],
      where: { questionId: 'question-1' },
    });
    expect(result).toEqual({ words, totalResponses: 9, uniqueWords: 2, uniqueParticipants: 3 });
  });

  it('returns an empty snapshot when there are no words yet', async () => {
    prisma.wordAggregate.findMany.mockResolvedValue([]);
    prisma.response.count.mockResolvedValue(0);
    prisma.response.groupBy.mockResolvedValue([]);

    const result = await service.getSnapshot('question-1');

    expect(result).toEqual({ words: [], totalResponses: 0, uniqueWords: 0, uniqueParticipants: 0 });
  });
});
