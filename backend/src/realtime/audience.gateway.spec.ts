import { AudienceGateway } from './audience.gateway';

function fakeSocket() {
  return {
    disconnect: jest.fn(),
    emit: jest.fn(),
    join: jest.fn(),
  };
}

describe('AudienceGateway', () => {
  let prisma: { topic: { findUnique: jest.Mock } };
  let gateway: AudienceGateway;

  beforeEach(() => {
    prisma = { topic: { findUnique: jest.fn() } };
    gateway = new AudienceGateway(prisma as never);
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

  it('joins the topic room when the code is valid', async () => {
    const client = fakeSocket();
    prisma.topic.findUnique.mockResolvedValue({ id: 'topic-1', code: 'ABC123' });

    const result = await gateway.handleJoin(client as never, { code: 'ABC123' });

    expect(client.join).toHaveBeenCalledWith('topic:topic-1');
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });
});
