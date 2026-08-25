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

describe('WordCloudGateway', () => {
  let jwtService: { verify: jest.Mock };
  let topicsService: { findOneForUser: jest.Mock };
  let wordCloudService: { getSnapshot: jest.Mock };
  let gateway: WordCloudGateway;

  const user = { id: 'user-1', email: 'a@example.com', name: 'A' };

  beforeEach(() => {
    jwtService = { verify: jest.fn() };
    topicsService = { findOneForUser: jest.fn() };
    wordCloudService = { getSnapshot: jest.fn() };
    gateway = new WordCloudGateway(
      jwtService as never,
      topicsService as never,
      wordCloudService as never,
    );
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
      topicsService.findOneForUser.mockRejectedValue(new Error('forbidden'));

      await gateway.handleJoin(client as never, { topicId: 'topic-1' });

      expect(topicsService.findOneForUser).toHaveBeenCalledWith('topic-1', user.id);
      expect(client.emit).toHaveBeenCalledWith('join:error', expect.any(Object));
      expect(client.join).not.toHaveBeenCalled();
    });

    it('joins the topic room when the user owns the topic', async () => {
      const client = fakeSocket();
      client.data.user = user;
      topicsService.findOneForUser.mockResolvedValue({ id: 'topic-1', ownerId: user.id });

      await gateway.handleJoin(client as never, { topicId: 'topic-1' });

      expect(client.join).toHaveBeenCalledWith('topic:topic-1');
    });
  });
});
