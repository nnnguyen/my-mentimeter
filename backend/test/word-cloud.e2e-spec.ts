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
}

interface JoinAck {
  ok: boolean;
  message?: string;
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
      data: {
        ownerId: owner.id,
        title: 'Realtime topic',
        question: 'Bạn nghĩ gì?',
        code: 'WCE001',
        status: 'ACTIVE',
        maxWordsPerUser: 5,
      },
    });
  });

  afterAll(async () => {
    await prisma.response.deleteMany({ where: { topicId: topic.id } });
    await prisma.wordAggregate.deleteMany({ where: { topicId: topic.id } });
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
      expect(joinAck).toEqual({ ok: true });

      const updatePromise = waitForEvent<WordCloudUpdate>(socket, 'wordcloud:update');

      await request(app.getHttpServer())
        .post(`/api/public/topics/${topic.code}/responses`)
        .send({ text: 'realtime', participantSessionId: '66666666-6666-4666-8666-666666666666' })
        .expect(201);

      const payload = await updatePromise;
      expect(payload.totalResponses).toBe(1);
      expect(payload.uniqueWords).toBe(1);
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
        .post(`/api/public/topics/${topic.code}/responses`)
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
});
