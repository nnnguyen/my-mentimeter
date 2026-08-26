import { AudienceGateway } from './audience.gateway';

function fakeSocket() {
  return {
    data: {} as { topicId?: string },
    disconnect: jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
  };
}

function fakeServer(roomSizes: Record<string, number> = {}) {
  return {
    adapter: {
      rooms: {
        get: (room: string) => {
          const size = roomSizes[room];
          return size === undefined ? undefined : { size };
        },
      },
    },
  };
}

describe('AudienceGateway', () => {
  let prisma: { topic: { findUnique: jest.Mock } };
  let wordCloudGateway: { broadcastJoinedCount: jest.Mock };
  let gateway: AudienceGateway;

  beforeEach(() => {
    prisma = { topic: { findUnique: jest.fn() } };
    wordCloudGateway = { broadcastJoinedCount: jest.fn() };
    gateway = new AudienceGateway(prisma as never, wordCloudGateway as never);
    gateway.server = fakeServer({ 'topic:topic-1': 1 }) as never;
  });

  it('disconnects when no code is provided', async () => {
    const client = fakeSocket();
    const result = await gateway.handleJoin(client as never, {});
    expect(client.disconnect).toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('emits join:error when the code does not match any topic', async () => {
    const client = fakeSocket();
    prisma.topic.findUnique.mockResolvedValue(null);

    const result = await gateway.handleJoin(client as never, { code: 'NOPE99' });

    expect(prisma.topic.findUnique).toHaveBeenCalledWith({ where: { code: 'NOPE99' } });
    expect(client.emit).toHaveBeenCalledWith('join:error', expect.any(Object));
    expect(client.join).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
  });

  it('joins the topic room and broadcasts the updated joined count', async () => {
    const client = fakeSocket();
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', code: 'ABC123' });

    const result = await gateway.handleJoin(client as never, { code: 'ABC123' });

    expect(client.join).toHaveBeenCalledWith('topic:topic-1');
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.topicId).toBe('topic-1');
    expect(wordCloudGateway.broadcastJoinedCount).toHaveBeenCalledWith('topic-1', 1);
    expect(result).toEqual({ ok: true });
  });

  it('broadcasts the updated joined count when a client disconnects', () => {
    const client = fakeSocket();
    client.data.topicId = 'topic-1';
    gateway.server = fakeServer({ 'topic:topic-1': 2 }) as never;

    gateway.handleDisconnect(client as never);

    expect(wordCloudGateway.broadcastJoinedCount).toHaveBeenCalledWith('topic-1', 2);
  });

  it('does nothing on disconnect if the client never joined a topic room', () => {
    const client = fakeSocket();

    gateway.handleDisconnect(client as never);

    expect(wordCloudGateway.broadcastJoinedCount).not.toHaveBeenCalled();
  });
});
