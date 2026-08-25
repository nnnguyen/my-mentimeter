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
}

@Injectable()
export class WordCloudService {
  constructor(private readonly prisma: PrismaService) {}

  async getSnapshot(topicId: string): Promise<WordCloudSnapshot> {
    const [words, totalResponses] = await Promise.all([
      this.prisma.wordAggregate.findMany({
        where: { topicId },
        orderBy: { count: 'desc' },
        select: { displayText: true, count: true },
      }),
      this.prisma.response.count({ where: { topicId } }),
    ]);

    return { words, totalResponses, uniqueWords: words.length };
  }
}
