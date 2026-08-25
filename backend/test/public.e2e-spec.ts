import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface PublicTopicResponse {
  topicTitle: string;
  status: string;
  currentQuestion: {
    id: string;
    prompt: string;
    status: string;
    config: {
      responseLimit: number | null;
      maxWordLength: number;
      allowDuplicateFromSameUser: boolean;
      showResultsToAudience: boolean;
    };
    myResponseCount: number;
  } | null;
}

describe('Public topics (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  let owner: { id: string };
  let activeTopic: { id: string; code: string };
  let draftTopic: { id: string; code: string };
  let activeQuestion: { id: string };
  let draftQuestion: { id: string };
  let duplicateBlockedQuestion: { id: string };

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
      data: { ownerId: owner.id, title: 'Chủ đề active', code: 'PUB001', status: 'ACTIVE' },
    });
    activeQuestion = await prisma.question.create({
      data: {
        topicId: activeTopic.id,
        order: 1,
        prompt: 'Bạn nghĩ gì?',
        status: 'ACTIVE',
        responseLimit: 2,
      },
    });
    await prisma.topic.update({
      where: { id: activeTopic.id },
      data: { currentQuestionId: activeQuestion.id },
    });

    draftTopic = await prisma.topic.create({
      data: { ownerId: owner.id, title: 'Chủ đề draft', code: 'PUB002', status: 'DRAFT' },
    });
    draftQuestion = await prisma.question.create({
      data: { topicId: draftTopic.id, order: 1, prompt: 'Câu hỏi nháp', status: 'DRAFT' },
    });
    await prisma.topic.update({
      where: { id: draftTopic.id },
      data: { currentQuestionId: draftQuestion.id },
    });

    duplicateBlockedQuestion = await prisma.question.create({
      data: {
        topicId: activeTopic.id,
        order: 2,
        prompt: 'Không cho trùng từ',
        status: 'ACTIVE',
        allowDuplicateFromSameUser: false,
      },
    });
  });

  afterAll(async () => {
    await prisma.response.deleteMany({
      where: {
        questionId: { in: [activeQuestion.id, draftQuestion.id, duplicateBlockedQuestion.id] },
      },
    });
    await prisma.wordAggregate.deleteMany({
      where: {
        questionId: { in: [activeQuestion.id, draftQuestion.id, duplicateBlockedQuestion.id] },
      },
    });
    await prisma.topic.deleteMany({ where: { ownerId: owner.id } });
    await prisma.user.delete({ where: { id: owner.id } });
    await app.close();
  });

  it('GET /api/public/topics/:code returns the public-safe fields for the active question', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/public/topics/${activeTopic.code}`)
      .expect(200);
    const body = res.body as PublicTopicResponse;
    expect(body.topicTitle).toBe('Chủ đề active');
    expect(body.status).toBe('ACTIVE');
    expect(body.currentQuestion).toMatchObject({
      id: activeQuestion.id,
      prompt: 'Bạn nghĩ gì?',
      status: 'ACTIVE',
      config: {
        responseLimit: 2,
        maxWordLength: 40,
        allowDuplicateFromSameUser: false,
        showResultsToAudience: false,
      },
      myResponseCount: 0,
    });
  });

  it('GET /api/public/topics/:code returns 404 for an unknown code', async () => {
    await request(app.getHttpServer()).get('/api/public/topics/NOPE99').expect(404);
  });

  it('rejects submissions to a question that is not ACTIVE (409)', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/questions/${draftQuestion.id}/responses`)
      .send({ text: 'hello', participantSessionId: '22222222-2222-4222-8222-222222222222' })
      .expect(409);
  });

  it('rejects text that normalizes to empty (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/questions/${activeQuestion.id}/responses`)
      .send({ text: '!!!', participantSessionId: '33333333-3333-4333-8333-333333333333' })
      .expect(400);
  });

  it('accepts submissions from different participants and merges case-different duplicates into one WordAggregate', async () => {
    const first = await request(app.getHttpServer())
      .post(`/api/public/questions/${activeQuestion.id}/responses`)
      .send({ text: 'Xin', participantSessionId: '44444444-4444-4444-8444-444444444444' })
      .expect(201);
    expect(first.body).toEqual({ submittedCount: 1, responseLimit: 2 });

    const second = await request(app.getHttpServer())
      .post(`/api/public/questions/${activeQuestion.id}/responses`)
      .send({ text: 'xin', participantSessionId: '99999999-9999-4999-8999-999999999999' })
      .expect(201);
    expect(second.body).toEqual({ submittedCount: 1, responseLimit: 2 });

    const aggregates = await prisma.wordAggregate.findMany({
      where: { questionId: activeQuestion.id, normalizedText: 'xin' },
    });
    expect(aggregates).toHaveLength(1);
    expect(aggregates[0].count).toBe(2);
    expect(aggregates[0].displayText).toBe('Xin'); // keeps the first-seen casing
  });

  it('enforces responseLimit once new distinct words push past the quota', async () => {
    const participantSessionId = '55555555-5555-4555-8555-555555555555';

    await request(app.getHttpServer())
      .post(`/api/public/questions/${activeQuestion.id}/responses`)
      .send({ text: 'một', participantSessionId })
      .expect(201);
    await request(app.getHttpServer())
      .post(`/api/public/questions/${activeQuestion.id}/responses`)
      .send({ text: 'hai', participantSessionId })
      .expect(201);

    // A 3rd distinct word from the same participant exceeds responseLimit (2).
    await request(app.getHttpServer())
      .post(`/api/public/questions/${activeQuestion.id}/responses`)
      .send({ text: 'ba', participantSessionId })
      .expect(429);
  });

  it('rejects a duplicate word from the same participant when allowDuplicateFromSameUser is false (409)', async () => {
    const participantSessionId = '88888888-8888-4888-8888-888888888888';

    await request(app.getHttpServer())
      .post(`/api/public/questions/${duplicateBlockedQuestion.id}/responses`)
      .send({ text: 'sáng tạo', participantSessionId })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/public/questions/${duplicateBlockedQuestion.id}/responses`)
      .send({ text: 'Sáng Tạo', participantSessionId })
      .expect(409);
  });

  it('rejects an invalid participantSessionId (400)', async () => {
    await request(app.getHttpServer())
      .post(`/api/public/questions/${activeQuestion.id}/responses`)
      .send({ text: 'hello', participantSessionId: 'not-a-uuid' })
      .expect(400);
  });
});
