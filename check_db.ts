import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('Checking submissions for Luna and Xena...');
  const subs = await prisma.submission.findMany({
    where: { student: { name: { in: ['Luna', 'Xena'] } } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { student: true }
  });
  console.log(JSON.stringify(subs, null, 2));

  console.log('\nChecking recent ClassAnalytics...');
  const analytics = await prisma.classAnalytics.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5
  });
  console.log(JSON.stringify(analytics, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
