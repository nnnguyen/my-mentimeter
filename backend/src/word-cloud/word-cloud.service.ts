import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface WordCloudWord {
  displayText: string;
  count: number;
}

export interface WordCloudSnapshot {
  words: WordCloudWord[];
  totalResponses: number;
  uniqueWords: number;
  uniqueParticipants: number;
}

@Injectable()
export class WordCloudService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(questionId: string): Promise<WordCloudSnapshot> {
    const [words, totalResponses, participants] = await Promise.all([
      this.prisma.wordAggregate.findMany({
        where: { questionId },
        orderBy: { count: 'desc' },
        select: { displayText: true, count: true },
      }),
      this.prisma.response.count({ where: { questionId } }),
      this.prisma.response.groupBy({
        by: ['participantSessionId'],
        where: { questionId },
      }),
    ]);

    return {
      words,
      totalResponses,
      uniqueWords: words.length,
      uniqueParticipants: participants.length,
    };
  }
}
