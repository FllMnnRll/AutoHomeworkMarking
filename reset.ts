import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  await prisma.classAnalytics.updateMany({
    where: { status: 'Error' },
    data: { status: 'None' }
  });
  console.log('Reset stuck analytics');
}

main().catch(console.error).finally(() => prisma.$disconnect());
