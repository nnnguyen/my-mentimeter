import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

interface TopicResponse {
  id: string;
  title: string;
  status: string;
}

describe('Topics (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwtService: JwtService;

  let userA: { id: string; email: string; name: string };
  let userB: { id: string; email: string; name: string };
  let cookieA: string;
  let cookieB: string;

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

    prisma = app.get(PrismaService);
    jwtService = app.get(JwtService);

    userA = (await prisma.user.create({
      data: {
        googleId: 'e2e-topics-user-a',
        email: 'e2e-topics-a@example.com',
        name: 'User A',
        isEmailVerified: true,
      },
    })) as { id: string; email: string; name: string };
    userB = (await prisma.user.create({
      data: {
        googleId: 'e2e-topics-user-b',
        email: 'e2e-topics-b@example.com',
        name: 'User B',
        isEmailVerified: true,
      },
    })) as { id: string; email: string; name: string };
    cookieA = cookieFor(userA);
    cookieB = cookieFor(userB);
  });

  afterAll(async () => {
    await prisma.topic.deleteMany({ where: { ownerId: { in: [userA.id, userB.id] } } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).post('/api/topics').send({ title: 'Chủ đề' }).expect(401);
  });

  it('lets the owner create, read, update, delete their topic, and blocks another user (403)', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/topics')
      .set('Cookie', cookieA)
      .send({ title: 'Chủ đề của A', description: 'Mô tả' })
      .expect(201);

    const created = createRes.body as { id: string; code: string };
    expect(typeof created.id).toBe('string');
    expect(typeof created.code).toBe('string');
    const topicId = created.id;

    // Cross-owner access must be forbidden.
    await request(app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Cookie', cookieB)
      .expect(403);
    await request(app.getHttpServer())
      .patch(`/api/topics/${topicId}`)
      .set('Cookie', cookieB)
      .send({ title: 'Hacked' })
      .expect(403);
    await request(app.getHttpServer())
      .delete(`/api/topics/${topicId}`)
      .set('Cookie', cookieB)
      .expect(403);

    // Owner can read and update.
    const getRes = await request(app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect((getRes.body as TopicResponse).title).toBe('Chủ đề của A');
    expect((getRes.body as TopicResponse).status).toBe('DRAFT');

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/topics/${topicId}`)
      .set('Cookie', cookieA)
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect((patchRes.body as TopicResponse).status).toBe('ACTIVE');

    const qrRes = await request(app.getHttpServer())
      .get(`/api/topics/${topicId}/qrcode`)
      .set('Cookie', cookieA)
      .expect(200);
    expect(qrRes.headers['content-type']).toBe('image/png');

    // Setting the current question requires ownership and the question must
    // belong to this topic.
    const questionRes = await request(app.getHttpServer())
      .post(`/api/topics/${topicId}/questions`)
      .set('Cookie', cookieA)
      .send({ prompt: 'Bạn nghĩ gì?' })
      .expect(201);
    const questionId = (questionRes.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/api/topics/${topicId}/current-question`)
      .set('Cookie', cookieB)
      .send({ questionId })
      .expect(403);

    const currentQuestionRes = await request(app.getHttpServer())
      .post(`/api/topics/${topicId}/current-question`)
      .set('Cookie', cookieA)
      .send({ questionId })
      .expect(201);
    expect((currentQuestionRes.body as { currentQuestionId: string }).currentQuestionId).toBe(
      questionId,
    );

    // Becoming the current question also opens it for responses, so
    // audiences don't land on a "not started" question with no way to start it.
    const activatedQuestionRes = await request(app.getHttpServer())
      .get(`/api/questions/${questionId}`)
      .set('Cookie', cookieA)
      .expect(200);
    expect((activatedQuestionRes.body as { status: string }).status).toBe('ACTIVE');

    await request(app.getHttpServer())
      .get('/api/topics')
      .set('Cookie', cookieA)
      .expect(200)
      .expect((res) => {
        const body = res.body as TopicResponse[];
        expect(body.some((t) => t.id === topicId)).toBe(true);
      });

    await request(app.getHttpServer())
      .delete(`/api/topics/${topicId}`)
      .set('Cookie', cookieA)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/api/topics/${topicId}`)
      .set('Cookie', cookieA)
      .expect(404);
  });
});
