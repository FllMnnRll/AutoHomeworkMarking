const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const slice = await prisma.slice.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(slice, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
