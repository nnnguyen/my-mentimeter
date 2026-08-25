import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const owner = await prisma.user.upsert({
    where: { googleId: 'seed-owner-google-id' },
    update: {},
    create: {
      googleId: 'seed-owner-google-id',
      email: 'presenter@example.com',
      name: 'Demo Presenter',
    },
  });

  const topic = await prisma.topic.create({
    data: {
      ownerId: owner.id,
      title: 'Buổi trình chiếu mẫu',
      description: 'Topic seed dùng để test luồng nhiều câu hỏi.',
      code: 'DEMO01',
      status: 'ACTIVE',
      questions: {
        create: [
          {
            order: 1,
            prompt: 'Điều gì truyền cảm hứng cho bạn trong công việc?',
            status: 'ACTIVE',
            responseLimit: null, // không giới hạn số lượt
          },
          {
            order: 2,
            prompt: 'Ba từ mô tả văn hoá đội nhóm của bạn?',
            status: 'DRAFT',
            responseLimit: 3, // giới hạn 3 lượt/thiết bị
          },
        ],
      },
    },
    include: { questions: { orderBy: { order: 'asc' } } },
  });

  const firstQuestion = topic.questions[0];
  await prisma.topic.update({
    where: { id: topic.id },
    data: { currentQuestionId: firstQuestion.id },
  });

  console.log(`Seeded topic "${topic.title}" (code: ${topic.code}) with ${topic.questions.length} questions.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
