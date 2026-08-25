import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionsService } from './questions.service';
import { PrismaService } from '../prisma/prisma.service';
import { TopicsService } from '../topics/topics.service';
import { WordCloudService } from '../word-cloud/word-cloud.service';
import { WordCloudGateway } from '../realtime/word-cloud.gateway';
import { ApplySettingsGroup } from './dto/apply-settings-to-all.dto';

describe('QuestionsService', () => {
  let service: QuestionsService;
  let prisma: {
    question: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      aggregate: jest.Mock;
    };
    topic: { updateMany: jest.Mock };
    response: { deleteMany: jest.Mock };
    wordAggregate: { deleteMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let topicsService: { findOneForUser: jest.Mock };
  let wordCloudService: { getSnapshot: jest.Mock };
  let wordCloudGateway: { broadcastSnapshot: jest.Mock; broadcastResultsRevealed: jest.Mock };

  const ownerId = 'owner-1';
  const topicId = 'topic-1';

  const question = {
    id: 'question-1',
    topicId,
    order: 1,
    prompt: 'Bạn nghĩ gì?',
    status: 'DRAFT',
    type: 'WORD_CLOUD',
    responseLimit: null,
    maxWordLength: 40,
    allowDuplicateFromSameUser: false,
    backgroundColor: '#FFFFFF',
    textColorScheme: 'default',
    showLogo: true,
    maxWordsDisplayed: 50,
    showJoiningInfo: true,
    joiningInfoType: 'QR_CODE',
    resultVisibility: 'INSTANT',
    resultsRevealed: false,
    showResultsToAudience: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    prisma = {
      question: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      topic: { updateMany: jest.fn() },
      response: { deleteMany: jest.fn() },
      wordAggregate: { deleteMany: jest.fn() },
      $transaction: jest.fn(),
    };
    topicsService = { findOneForUser: jest.fn() };
    wordCloudService = { getSnapshot: jest.fn() };
    wordCloudGateway = {
      broadcastSnapshot: jest.fn().mockResolvedValue(undefined),
      broadcastResultsRevealed: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TopicsService, useValue: topicsService },
        { provide: WordCloudService, useValue: wordCloudService },
        { provide: WordCloudGateway, useValue: wordCloudGateway },
      ],
    }).compile();

    service = module.get(QuestionsService);
  });

  describe('create', () => {
    it('rejects when the topic belongs to another user', async () => {
      topicsService.findOneForUser.mockRejectedValue(new ForbiddenException());
      await expect(service.create(topicId, ownerId, {})).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.question.create).not.toHaveBeenCalled();
    });

    it('assigns order = max(order) + 1', async () => {
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.aggregate.mockResolvedValue({ _max: { order: 2 } });
      prisma.question.create.mockResolvedValue({ ...question, order: 3 });

      await service.create(topicId, ownerId, { prompt: 'Câu mới' });

      expect(prisma.question.create).toHaveBeenCalledWith({
        data: { topicId, order: 3, prompt: 'Câu mới' },
      });
    });

    it('assigns order = 1 for the first question in a topic', async () => {
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.aggregate.mockResolvedValue({ _max: { order: null } });
      prisma.question.create.mockResolvedValue(question);

      await service.create(topicId, ownerId, {});

      expect(prisma.question.create).toHaveBeenCalledWith({
        data: { topicId, order: 1, prompt: '' },
      });
    });
  });

  describe('ownership via parent topic', () => {
    it('rejects update when the question belongs to another user', async () => {
      prisma.question.findUnique.mockResolvedValue(question);
      topicsService.findOneForUser.mockRejectedValue(new ForbiddenException());

      await expect(service.update(question.id, 'someone-else', {})).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.question.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('re-sequences the remaining questions to be contiguous and clears currentQuestionId if it matched', async () => {
      prisma.question.findUnique.mockResolvedValue(question);
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });

      const tx = {
        question: {
          delete: jest.fn(),
          findMany: jest.fn().mockResolvedValue([
            { id: 'q2', order: 3 },
            { id: 'q3', order: 4 },
          ]),
          update: jest.fn(),
        },
        topic: { updateMany: jest.fn() },
      };
      prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) => cb(tx));

      await service.remove(question.id, ownerId);

      expect(tx.question.delete).toHaveBeenCalledWith({ where: { id: question.id } });
      expect(tx.topic.updateMany).toHaveBeenCalledWith({
        where: { id: topicId, currentQuestionId: question.id },
        data: { currentQuestionId: null },
      });
      expect(tx.question.update).toHaveBeenCalledWith({
        where: { id: 'q2' },
        data: { order: 1 },
      });
      expect(tx.question.update).toHaveBeenCalledWith({
        where: { id: 'q3' },
        data: { order: 2 },
      });
    });
  });

  describe('reorder', () => {
    it('rejects when orderedIds does not match the question set in the topic', async () => {
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.findMany.mockResolvedValue([{ id: 'q1' }, { id: 'q2' }]);

      await expect(service.reorder(topicId, ownerId, ['q1', 'q3'])).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('reorders via a two-phase transaction to avoid unique constraint collisions', async () => {
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.findMany
        .mockResolvedValueOnce([{ id: 'q1' }, { id: 'q2' }])
        .mockResolvedValueOnce([
          { ...question, id: 'q2', order: 1 },
          { ...question, id: 'q1', order: 2 },
        ]);
      prisma.question.update.mockReturnValue('update-call');
      prisma.$transaction.mockResolvedValue(undefined);

      await service.reorder(topicId, ownerId, ['q2', 'q1']);

      expect(prisma.$transaction).toHaveBeenCalledWith([
        'update-call',
        'update-call',
        'update-call',
        'update-call',
      ]);
      expect(prisma.question.update).toHaveBeenNthCalledWith(1, {
        where: { id: 'q2' },
        data: { order: -1 },
      });
      expect(prisma.question.update).toHaveBeenNthCalledWith(2, {
        where: { id: 'q1' },
        data: { order: -2 },
      });
      expect(prisma.question.update).toHaveBeenNthCalledWith(3, {
        where: { id: 'q2' },
        data: { order: 1 },
      });
      expect(prisma.question.update).toHaveBeenNthCalledWith(4, {
        where: { id: 'q1' },
        data: { order: 2 },
      });
    });
  });

  describe('duplicate', () => {
    it('copies config fields into a new question with a fresh order, reset status and resultsRevealed', async () => {
      prisma.question.findUnique.mockResolvedValue(question);
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.aggregate.mockResolvedValue({ _max: { order: 1 } });
      prisma.question.create.mockResolvedValue({ ...question, id: 'question-2', order: 2 });

      await service.duplicate(question.id, ownerId);

      expect(prisma.question.create).toHaveBeenCalledWith({
        data: {
          prompt: question.prompt,
          type: question.type,
          responseLimit: question.responseLimit,
          maxWordLength: question.maxWordLength,
          allowDuplicateFromSameUser: question.allowDuplicateFromSameUser,
          backgroundColor: question.backgroundColor,
          textColorScheme: question.textColorScheme,
          showLogo: question.showLogo,
          maxWordsDisplayed: question.maxWordsDisplayed,
          showJoiningInfo: question.showJoiningInfo,
          joiningInfoType: question.joiningInfoType,
          resultVisibility: question.resultVisibility,
          showResultsToAudience: question.showResultsToAudience,
          topicId,
          order: 2,
          status: 'DRAFT',
          resultsRevealed: false,
        },
      });
    });
  });

  describe('applySettingsToAll', () => {
    it('copies only the fields belonging to the requested groups, to every question in the topic', async () => {
      prisma.question.findUnique.mockResolvedValue({
        ...question,
        showJoiningInfo: false,
        joiningInfoType: 'LINK',
        resultVisibility: 'ON_CLICK',
      });
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.updateMany.mockResolvedValue({ count: 3 });

      const result = await service.applySettingsToAll(question.id, ownerId, [
        ApplySettingsGroup.JOINING,
      ]);

      expect(prisma.question.updateMany).toHaveBeenCalledWith({
        where: { topicId },
        data: { showJoiningInfo: false, joiningInfoType: 'LINK' },
      });
      expect(result).toEqual({ updatedCount: 3 });
    });

    it('supports the showResponses group independently', async () => {
      prisma.question.findUnique.mockResolvedValue({ ...question, resultVisibility: 'PRIVATE' });
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.updateMany.mockResolvedValue({ count: 1 });

      await service.applySettingsToAll(question.id, ownerId, [ApplySettingsGroup.SHOW_RESPONSES]);

      expect(prisma.question.updateMany).toHaveBeenCalledWith({
        where: { topicId },
        data: { resultVisibility: 'PRIVATE' },
      });
    });
  });

  describe('revealResults', () => {
    it('rejects when resultVisibility is not ON_CLICK', async () => {
      prisma.question.findUnique.mockResolvedValue({ ...question, resultVisibility: 'INSTANT' });
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });

      await expect(service.revealResults(question.id, ownerId)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.question.update).not.toHaveBeenCalled();
    });

    it('sets resultsRevealed = true and broadcasts the snapshot', async () => {
      const onClickQuestion = { ...question, resultVisibility: 'ON_CLICK' };
      prisma.question.findUnique.mockResolvedValue(onClickQuestion);
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.question.update.mockResolvedValue({ ...onClickQuestion, resultsRevealed: true });

      await service.revealResults(question.id, ownerId);

      expect(prisma.question.update).toHaveBeenCalledWith({
        where: { id: question.id },
        data: { resultsRevealed: true },
      });
      expect(wordCloudGateway.broadcastResultsRevealed).toHaveBeenCalledWith(topicId, question.id);
    });
  });

  describe('getWordCloud', () => {
    it('delegates to WordCloudService once ownership is verified', async () => {
      prisma.question.findUnique.mockResolvedValue(question);
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      const snapshot = { words: [], totalResponses: 0, uniqueWords: 0 };
      wordCloudService.getSnapshot.mockResolvedValue(snapshot);

      await expect(service.getWordCloud(question.id, ownerId)).resolves.toEqual(snapshot);
      expect(wordCloudService.getSnapshot).toHaveBeenCalledWith(question.id);
    });
  });

  describe('deleteResponses', () => {
    it('clears Response and WordAggregate for the question and broadcasts an empty snapshot', async () => {
      prisma.question.findUnique.mockResolvedValue(question);
      topicsService.findOneForUser.mockResolvedValue({ id: topicId, ownerId });
      prisma.response.deleteMany.mockReturnValue('delete-responses-call');
      prisma.wordAggregate.deleteMany.mockReturnValue('delete-aggregates-call');
      prisma.$transaction.mockResolvedValue(undefined);

      await service.deleteResponses(question.id, ownerId);

      expect(prisma.$transaction).toHaveBeenCalledWith([
        'delete-responses-call',
        'delete-aggregates-call',
      ]);
      expect(prisma.response.deleteMany).toHaveBeenCalledWith({
        where: { questionId: question.id },
      });
      expect(prisma.wordAggregate.deleteMany).toHaveBeenCalledWith({
        where: { questionId: question.id },
      });
      expect(wordCloudGateway.broadcastSnapshot).toHaveBeenCalledWith(topicId, question.id);
    });
  });
});
