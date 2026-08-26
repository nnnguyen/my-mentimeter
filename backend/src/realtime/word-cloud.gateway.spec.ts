import { WordCloudGateway } from './word-cloud.gateway';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.constants';

function fakeSocket(cookie?: string) {
  return {
    handshake: { headers: { cookie } },
    data: {} as { user?: { id: string; email: string; name: string } },
    disconnect: jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
  };
}

function fakeServer() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { to, emit };
}

describe('WordCloudGateway', () => {
  let jwtService: { verify: jest.Mock };
  let prisma: { topic: { findUnique: jest.Mock }; question: { findUnique: jest.Mock } };
  let wordCloudService: { getSnapshot: jest.Mock };
  let presenterServer: ReturnType<typeof fakeServer>;
  let audienceServer: ReturnType<typeof fakeServer>;
  let audienceGateway: { server: ReturnType<typeof fakeServer>; joinedCount: jest.Mock };
  let gateway: WordCloudGateway;

  const user = { id: 'user-1', email: 'a@example.com', name: 'A' };
  const topic = { id: 'topic-1', ownerId: user.id };

  const question = {
    id: 'question-1',
    topicId: 'topic-1',
    order: 1,
    prompt: 'Bạn nghĩ gì?',
    status: 'ACTIVE',
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
  };

  const snapshot = {
    words: [{ displayText: 'hello', count: 2 }],
    totalResponses: 2,
    uniqueWords: 1,
    uniqueParticipants: 2,
  };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    prisma = { topic: { findUnique: jest.fn() }, question: { findUnique: jest.fn() } };
    wordCloudService = { getSnapshot: jest.fn() };
    presenterServer = fakeServer();
    audienceServer = fakeServer();
    audienceGateway = { server: audienceServer, joinedCount: jest.fn().mockReturnValue(0) };
    gateway = new WordCloudGateway(
      jwtService as never,
      prisma as never,
      wordCloudService as never,
      audienceGateway as never,
    );
    gateway.server = presenterServer as never;
  });

  describe('handleConnection', () => {
    it('disconnects when there is no cookie header at all', () => {
      const client = fakeSocket(undefined);
      gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects when the access_token cookie is missing', () => {
      const client = fakeSocket('other=value');
      gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('disconnects when the token fails verification', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid');
      });
      const client = fakeSocket(`${ACCESS_TOKEN_COOKIE}=bad-token`);
      gateway.handleConnection(client as never);
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.data.user).toBeUndefined();
    });

    it('sets client.data.user when the token is valid', () => {
      jwtService.verify.mockReturnValue({ sub: user.id, email: user.email, name: user.name });
      const client = fakeSocket(`${ACCESS_TOKEN_COOKIE}=good-token`);
      gateway.handleConnection(client as never);
      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.data.user).toEqual(user);
    });
  });

  describe('handleJoin', () => {
    it('disconnects when the socket has no authenticated user', async () => {
      const client = fakeSocket();
      await gateway.handleJoin(client as never, { topicId: 'topic-1' });
      expect(client.disconnect).toHaveBeenCalled();
      expect(client.join).not.toHaveBeenCalled();
    });

    it('disconnects when no topicId is provided', async () => {
      const client = fakeSocket();
      client.data.user = user;
      await gateway.handleJoin(client as never, {});
      expect(client.disconnect).toHaveBeenCalled();
    });

    it('emits join:error and does not join the room when the user is not the topic owner', async () => {
      const client = fakeSocket();
      client.data.user = user;
      prisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', ownerId: 'someone-else' });

      await gateway.handleJoin(client as never, { topicId: 'topic-1' });

      expect(prisma.topic.findUnique).toHaveBeenCalledWith({ where: { id: 'topic-1' } });
      expect(client.emit).toHaveBeenCalledWith('join:error', expect.any(Object));
      expect(client.join).not.toHaveBeenCalled();
    });

    it('emits join:error when the topic does not exist', async () => {
      const client = fakeSocket();
      client.data.user = user;
      prisma.topic.findUnique.mockResolvedValue(null);

      await gateway.handleJoin(client as never, { topicId: 'topic-1' });

      expect(client.emit).toHaveBeenCalledWith('join:error', expect.any(Object));
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins the topic room when the user owns the topic', async () => {
      const client = fakeSocket();
      client.data.user = user;
      prisma.topic.findUnique.mockResolvedValue(topic);

      await gateway.handleJoin(client as never, { topicId: 'topic-1' });

      expect(client.join).toHaveBeenCalledWith('topic:topic-1');
    });

    it('returns the current audience joined count so a reconnecting presenter is never stale', async () => {
      const client = fakeSocket();
      client.data.user = user;
      prisma.topic.findUnique.mockResolvedValue(topic);
      audienceGateway.joinedCount.mockReturnValue(3);

      const result = await gateway.handleJoin(client as never, { topicId: 'topic-1' });

      expect(audienceGateway.joinedCount).toHaveBeenCalledWith('topic-1');
      expect(result).toEqual({ ok: true, joinedCount: 3 });
    });
  });

  describe('broadcastSnapshot', () => {
    it('sends the full word list to both namespaces when resultVisibility is INSTANT', async () => {
      wordCloudService.getSnapshot.mockResolvedValue(snapshot);
      prisma.question.findUnique.mockResolvedValue(question);

      await gateway.broadcastSnapshot('topic-1', question.id);

      const expectedPayload = { ...snapshot, questionId: question.id };
      expect(presenterServer.to).toHaveBeenCalledWith('topic:topic-1');
      expect(presenterServer.emit).toHaveBeenCalledWith('wordcloud:update', expectedPayload);
      expect(audienceServer.to).toHaveBeenCalledWith('topic:topic-1');
      expect(audienceServer.emit).toHaveBeenCalledWith('wordcloud:update', expectedPayload);
    });

    it('hides the word list when resultVisibility is PRIVATE', async () => {
      wordCloudService.getSnapshot.mockResolvedValue(snapshot);
      prisma.question.findUnique.mockResolvedValue({ ...question, resultVisibility: 'PRIVATE' });

      await gateway.broadcastSnapshot('topic-1', question.id);

      const hiddenPayload = {
        totalResponses: snapshot.totalResponses,
        uniqueParticipants: snapshot.uniqueParticipants,
        questionId: question.id,
      };
      expect(presenterServer.emit).toHaveBeenCalledWith('wordcloud:update', hiddenPayload);
    });

    it('hides the word list when resultVisibility is ON_CLICK and resultsRevealed is false', async () => {
      wordCloudService.getSnapshot.mockResolvedValue(snapshot);
      prisma.question.findUnique.mockResolvedValue({
        ...question,
        resultVisibility: 'ON_CLICK',
        resultsRevealed: false,
      });

      await gateway.broadcastSnapshot('topic-1', question.id);

      expect(presenterServer.emit).toHaveBeenCalledWith('wordcloud:update', {
        totalResponses: snapshot.totalResponses,
        uniqueParticipants: snapshot.uniqueParticipants,
        questionId: question.id,
      });
    });

    it('shows the full word list when resultVisibility is ON_CLICK and resultsRevealed is true', async () => {
      wordCloudService.getSnapshot.mockResolvedValue(snapshot);
      prisma.question.findUnique.mockResolvedValue({
        ...question,
        resultVisibility: 'ON_CLICK',
        resultsRevealed: true,
      });

      await gateway.broadcastSnapshot('topic-1', question.id);

      expect(presenterServer.emit).toHaveBeenCalledWith('wordcloud:update', {
        ...snapshot,
        questionId: question.id,
      });
    });
  });

  describe('broadcastResultsRevealed', () => {
    it('always sends the full snapshot to both namespaces under results:revealed', async () => {
      wordCloudService.getSnapshot.mockResolvedValue(snapshot);

      await gateway.broadcastResultsRevealed('topic-1', question.id);

      const expectedPayload = { ...snapshot, questionId: question.id };
      expect(presenterServer.emit).toHaveBeenCalledWith('results:revealed', expectedPayload);
      expect(audienceServer.emit).toHaveBeenCalledWith('results:revealed', expectedPayload);
    });
  });

  describe('broadcastJoinedCount', () => {
    it('emits participants:joined with the count to the presenter namespace only', () => {
      gateway.broadcastJoinedCount('topic-1', 4);

      expect(presenterServer.to).toHaveBeenCalledWith('topic:topic-1');
      expect(presenterServer.emit).toHaveBeenCalledWith('participants:joined', { count: 4 });
      expect(audienceServer.emit).not.toHaveBeenCalled();
    });
  });

  describe('broadcastQuestionChanged', () => {
    it('emits question:changed with the question config to both namespaces', () => {
      gateway.broadcastQuestionChanged('topic-1', question as never);

      const expectedPayload = {
        questionId: question.id,
        order: question.order,
        prompt: question.prompt,
        status: question.status,
        config: {
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
          resultsRevealed: question.resultsRevealed,
          showResultsToAudience: question.showResultsToAudience,
        },
      };

      expect(presenterServer.emit).toHaveBeenCalledWith('question:changed', expectedPayload);
      expect(audienceServer.emit).toHaveBeenCalledWith('question:changed', expectedPayload);
    });
  });
});
