import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface WordCloudUpdate {
  words: { displayText: string; count: number }[];
  totalResponses: number;
  uniqueWords: number;
  uniqueParticipants: number;
  questionId: string;
}

interface JoinAck {
  ok: boolean;
  message?: string;
  joinedCount?: number;
}

function waitForEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

describe('WordCloudGateway (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;
  let baseUrl: string;

  let owner: { id: string; email: string; name: string };
  let intruder: { id: string; email: string; name: string };
  let topic: { id: string; code: string };
  let question: { id: string };
  let onClickQuestion: { id: string };

  const cookieFor = (user: { id: string; email: string; name: string }) => {
    const token = jwtService.sign({ sub: user.id, email: user.email, name: user.name });
    return `access_token=${token}`;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    // socket.io-client needs a real bound port, unlike supertest's in-memory server.
    await app.listen(0);
    const httpServer = app.getHttpServer() as Server;
    const address = httpServer.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    owner = await prisma.user.create({
      data: { googleId: 'e2e-wc-owner', email: 'e2e-wc-owner@example.com', name: 'Owner' },
    });
    intruder = await prisma.user.create({
      data: { googleId: 'e2e-wc-intruder', email: 'e2e-wc-intruder@example.com', name: 'Intruder' },
    });
    topic = await prisma.topic.create({
      data: { ownerId: owner.id, title: 'Realtime topic', code: 'WCE001', status: 'ACTIVE' },
    });
    question = await prisma.question.create({
      data: {
        topicId: topic.id,
        order: 1,
        prompt: 'Bạn nghĩ gì?',
        status: 'ACTIVE',
        responseLimit: 5,
      },
    });
    onClickQuestion = await prisma.question.create({
      data: {
        topicId: topic.id,
        order: 2,
        prompt: 'Kết quả chỉ hiện khi bấm',
        status: 'ACTIVE',
        resultVisibility: 'ON_CLICK',
      },
    });
  });

  afterAll(async () => {
    await prisma.response.deleteMany({
      where: { questionId: { in: [question.id, onClickQuestion.id] } },
    });
    await prisma.wordAggregate.deleteMany({
      where: { questionId: { in: [question.id, onClickQuestion.id] } },
    });
    await prisma.topic.delete({ where: { id: topic.id } });
    await prisma.user.deleteMany({ where: { id: { in: [owner.id, intruder.id] } } });
    await app.close();
  });

  it('broadcasts wordcloud:update to the owner after a public response is submitted', async () => {
    const socket = io(`${baseUrl}/presenter`, {
      extraHeaders: { Cookie: cookieFor(owner) },
      transports: ['websocket'],
    });

    try {
      await waitForEvent(socket, 'connect');
      const joinAck = (await socket.emitWithAck('join', { topicId: topic.id })) as JoinAck;
      expect(joinAck).toEqual({ ok: true, joinedCount: 0 });

      const updatePromise = waitForEvent<WordCloudUpdate>(socket, 'wordcloud:update');

      await request(app.getHttpServer())
        .post(`/api/public/questions/${question.id}/responses`)
        .send({ text: 'realtime', participantSessionId: '66666666-6666-4666-8666-666666666666' })
        .expect(201);

      const payload = await updatePromise;
      expect(payload.questionId).toBe(question.id);
      expect(payload.totalResponses).toBe(1);
      expect(payload.uniqueWords).toBe(1);
      expect(payload.uniqueParticipants).toBe(1);
      expect(payload.words).toEqual([{ displayText: 'realtime', count: 1 }]);
    } finally {
      socket.disconnect();
    }
  });

  it('does not let a non-owner join the topic room', async () => {
    const socket = io(`${baseUrl}/presenter`, {
      extraHeaders: { Cookie: cookieFor(intruder) },
      transports: ['websocket'],
    });

    try {
      await waitForEvent(socket, 'connect');
      const joinAck = (await socket.emitWithAck('join', { topicId: topic.id })) as JoinAck;
      expect(joinAck.ok).toBe(false);
      expect(typeof joinAck.message).toBe('string');

      // Confirm the intruder never receives the room's broadcast.
      const gotUpdate = waitForEvent(socket, 'wordcloud:update', 1500).then(
        () => true,
        () => false,
      );
      await request(app.getHttpServer())
        .post(`/api/public/questions/${question.id}/responses`)
        .send({ text: 'second', participantSessionId: '77777777-7777-4777-8777-777777777777' })
        .expect(201);
      await expect(gotUpdate).resolves.toBe(false);
    } finally {
      socket.disconnect();
    }
  });

  it('disconnects a socket with no valid auth cookie', async () => {
    const socket = io(`${baseUrl}/presenter`, { transports: ['websocket'] });
    try {
      await waitForEvent(socket, 'disconnect');
    } finally {
      socket.disconnect();
    }
  });

  it('lets an audience device join by code and receive wordcloud:update', async () => {
    const socket = io(`${baseUrl}/audience`, { transports: ['websocket'] });

    try {
      await waitForEvent(socket, 'connect');
      const joinAck = (await socket.emitWithAck('join', { code: topic.code })) as JoinAck;
      expect(joinAck).toEqual({ ok: true });

      const updatePromise = waitForEvent<WordCloudUpdate>(socket, 'wordcloud:update');

      await request(app.getHttpServer())
        .post(`/api/public/questions/${question.id}/responses`)
        .send({ text: 'audience', participantSessionId: '11122233-1122-4122-8122-112233112233' })
        .expect(201);

      const payload = await updatePromise;
      expect(payload.questionId).toBe(question.id);
      expect(payload.words).toEqual(
        expect.arrayContaining([{ displayText: 'audience', count: 1 }]),
      );
    } finally {
      socket.disconnect();
    }
  });

  it('broadcasts participants:joined to the presenter as audience devices join and leave', async () => {
    const presenterSocket = io(`${baseUrl}/presenter`, {
      extraHeaders: { Cookie: cookieFor(owner) },
      transports: ['websocket'],
    });
    let audienceSocketA: Socket | undefined;
    let audienceSocketB: Socket | undefined;

    try {
      await waitForEvent(presenterSocket, 'connect');
      await presenterSocket.emitWithAck('join', { topicId: topic.id });

      const firstJoined = waitForEvent<{ count: number }>(presenterSocket, 'participants:joined');
      audienceSocketA = io(`${baseUrl}/audience`, { transports: ['websocket'] });
      await waitForEvent(audienceSocketA, 'connect');
      await audienceSocketA.emitWithAck('join', { code: topic.code });
      expect(await firstJoined).toEqual({ count: 1 });

      const secondJoined = waitForEvent<{ count: number }>(presenterSocket, 'participants:joined');
      audienceSocketB = io(`${baseUrl}/audience`, { transports: ['websocket'] });
      await waitForEvent(audienceSocketB, 'connect');
      await audienceSocketB.emitWithAck('join', { code: topic.code });
      expect(await secondJoined).toEqual({ count: 2 });

      const afterLeave = waitForEvent<{ count: number }>(presenterSocket, 'participants:joined');
      audienceSocketB.disconnect();
      audienceSocketB = undefined;
      expect(await afterLeave).toEqual({ count: 1 });
    } finally {
      presenterSocket.disconnect();
      audienceSocketA?.disconnect();
      audienceSocketB?.disconnect();
    }
  });

  it('rejects an audience join with an unknown code', async () => {
    const socket = io(`${baseUrl}/audience`, { transports: ['websocket'] });
    try {
      await waitForEvent(socket, 'connect');
      const joinAck = (await socket.emitWithAck('join', { code: 'NOPE99' })) as JoinAck;
      expect(joinAck.ok).toBe(false);
    } finally {
      socket.disconnect();
    }
  });

  it('gates wordcloud:update on both namespaces for ON_CLICK until reveal-results, then exposes full words via results:revealed', async () => {
    const presenterSocket = io(`${baseUrl}/presenter`, {
      extraHeaders: { Cookie: cookieFor(owner) },
      transports: ['websocket'],
    });
    const audienceSocket = io(`${baseUrl}/audience`, { transports: ['websocket'] });

    try {
      await Promise.all([
        waitForEvent(presenterSocket, 'connect'),
        waitForEvent(audienceSocket, 'connect'),
      ]);
      await presenterSocket.emitWithAck('join', { topicId: topic.id });
      await audienceSocket.emitWithAck('join', { code: topic.code });

      const presenterGated = waitForEvent<WordCloudUpdate>(presenterSocket, 'wordcloud:update');
      const audienceGated = waitForEvent<WordCloudUpdate>(audienceSocket, 'wordcloud:update');

      await request(app.getHttpServer())
        .post(`/api/public/questions/${onClickQuestion.id}/responses`)
        .send({ text: 'giấu', participantSessionId: '22233344-2233-4233-8233-223344223344' })
        .expect(201);

      const [presenterGatedPayload, audienceGatedPayload] = await Promise.all([
        presenterGated,
        audienceGated,
      ]);
      expect(presenterGatedPayload).toEqual({
        totalResponses: 1,
        uniqueParticipants: 1,
        questionId: onClickQuestion.id,
      });
      expect(presenterGatedPayload.words).toBeUndefined();
      expect(audienceGatedPayload).toEqual({
        totalResponses: 1,
        uniqueParticipants: 1,
        questionId: onClickQuestion.id,
      });

      const presenterRevealed = waitForEvent<WordCloudUpdate>(presenterSocket, 'results:revealed');
      const audienceRevealed = waitForEvent<WordCloudUpdate>(audienceSocket, 'results:revealed');

      await request(app.getHttpServer())
        .post(`/api/questions/${onClickQuestion.id}/reveal-results`)
        .set('Cookie', cookieFor(owner))
        .expect(201);

      const [presenterRevealedPayload, audienceRevealedPayload] = await Promise.all([
        presenterRevealed,
        audienceRevealed,
      ]);
      expect(presenterRevealedPayload.words).toEqual([{ displayText: 'giấu', count: 1 }]);
      expect(audienceRevealedPayload.words).toEqual([{ displayText: 'giấu', count: 1 }]);
    } finally {
      presenterSocket.disconnect();
      audienceSocket.disconnect();
    }
  });

  it('broadcasts question:changed to both namespaces when the presenter switches question', async () => {
    const presenterSocket = io(`${baseUrl}/presenter`, {
      extraHeaders: { Cookie: cookieFor(owner) },
      transports: ['websocket'],
    });
    const audienceSocket = io(`${baseUrl}/audience`, { transports: ['websocket'] });

    try {
      await Promise.all([
        waitForEvent(presenterSocket, 'connect'),
        waitForEvent(audienceSocket, 'connect'),
      ]);
      await presenterSocket.emitWithAck('join', { topicId: topic.id });
      await audienceSocket.emitWithAck('join', { code: topic.code });

      const presenterChanged = waitForEvent<{ questionId: string }>(
        presenterSocket,
        'question:changed',
      );
      const audienceChanged = waitForEvent<{ questionId: string }>(
        audienceSocket,
        'question:changed',
      );

      await request(app.getHttpServer())
        .post(`/api/topics/${topic.id}/current-question`)
        .set('Cookie', cookieFor(owner))
        .send({ questionId: question.id })
        .expect(201);

      const [presenterPayload, audiencePayload] = await Promise.all([
        presenterChanged,
        audienceChanged,
      ]);
      expect(presenterPayload.questionId).toBe(question.id);
      expect(audiencePayload.questionId).toBe(question.id);
    } finally {
      presenterSocket.disconnect();
      audienceSocket.disconnect();
    }
  });
});
