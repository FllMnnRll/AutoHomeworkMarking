const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const result = await prisma.submission.updateMany({
    where: { status: 'Processing OCR' },
    data: { status: 'Queued' }
  });
  console.log("Reset count:", result.count);
}

main().finally(() => prisma.$disconnect());
