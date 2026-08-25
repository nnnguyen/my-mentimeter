import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface PublicTopicResponse {
  title: string;
  question: string;
  status: string;
  maxWordsPerUser: number;
}

describe('Public topics (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let owner: { id: string };
  let activeTopic: { id: string; code: string };
  let draftTopic: { id: string; code: string };

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

    prisma = app.get(PrismaService);

    owner = await prisma.user.create({
      data: {
        googleId: 'e2e-public-owner',
        email: 'e2e-public-owner@example.com',
        name: 'Owner',
      },
    });

    activeTopic = await prisma.topic.create({
      data: {
        ownerId: owner.id,
        title: 'Chủ đề active',
        question: 'Bạn nghĩ gì?',
        code: 'PUB001',
        status: 'ACTIVE',
        maxWordsPerUser: 2,
      },
    });

    draftTopic = await prisma.topic.create({
      data: {
        ownerId: owner.id,
        title: 'Chủ đề draft',
        question: 'Câu hỏi nháp',
        code: 'PUB002',
        status: 'DRAFT',
      },
    });
  });

  afterAll(async () => {
    await prisma.response.deleteMany({
      where: { topicId: { in: [activeTopic.id, draftTopic.id] } },
    });
    await prisma.wordAggregate.deleteMany({
      where: { topicId: { in: [activeTopic.id, draftTopic.id] } },
    });
    await prisma.topic.deleteMany({ where: { ownerId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
    await app.close();
  });

  it('GET /api/public/topics/:code returns the public-safe fields', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/public/topics/${activeTopic.code}`)
      .expect(200);
    const body = res.body as PublicTopicResponse;
    expect(body).toEqual({
      title: 'Chủ đề active',
      question: 'Bạn nghĩ gì?',
      status: 'ACTIVE',
      maxWordsPerUser: 2,
    });
  });

  it('GET /api/public/topics/:code returns 404 for an unknown code', async () => {
    await request(app.getHttpServer()).get('/api/public/topics/NOPE99').expect(404);
  });

  it('rejects submissions to a topic that is not ACTIVE (409)', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/topics/${draftTopic.code}/responses`)
      .send({ text: 'hello', participantSessionId: '22222222-2222-4222-8222-222222222222' })
      .expect(409);
  });

  it('rejects text that normalizes to empty (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/topics/${activeTopic.code}/responses`)
      .send({ text: '!!!', participantSessionId: '33333333-3333-4333-8333-333333333333' })
      .expect(400);
  });

  it('accepts submissions, merges case-different duplicates into one WordAggregate, and enforces maxWordsPerUser', async () => {
    const participantSessionId = '44444444-4444-4444-8444-444444444444';

    const first = await request(app.getHttpServer())
      .post(`/api/public/topics/${activeTopic.code}/responses`)
      .send({ text: 'Xin', participantSessionId })
      .expect(201);
    expect(first.body).toEqual({ submittedCount: 1, maxWordsPerUser: 2 });

    const second = await request(app.getHttpServer())
      .post(`/api/public/topics/${activeTopic.code}/responses`)
      .send({ text: 'xin', participantSessionId })
      .expect(201);
    expect(second.body).toEqual({ submittedCount: 2, maxWordsPerUser: 2 });

    const aggregates = await prisma.wordAggregate.findMany({
      where: { topicId: activeTopic.id, normalizedText: 'xin' },
    });
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].count).toBe(2);
    expect(aggregates[0].displayText).toBe('Xin'); // keeps the first-seen casing

    // A 3rd word from the same participant exceeds maxWordsPerUser (2).
    await request(app.getHttpServer())
      .post(`/api/public/topics/${activeTopic.code}/responses`)
      .send({ text: 'another', participantSessionId })
      .expect(429);
  });

  it('rejects an invalid participantSessionId (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/topics/${activeTopic.code}/responses`)
      .send({ text: 'hello', participantSessionId: 'not-a-uuid' })
      .expect(400);
  });
});
