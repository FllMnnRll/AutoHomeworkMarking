// check current state of submissions
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const subs = await p.submission.findMany({
    where: { assignmentId: 'efff1085-dd55-4cdd-b12a-c8537e4c4d26' },
    select: {
      id: true,
      status: true,
      totalScore: true,
      needsReview: true,
      errorMessage: true,
      rawImagePath: true,
      _count: { select: { slices: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
  console.log(JSON.stringify(subs, null, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
