const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.submission.update({
    where: { id: "238162ad-ace3-4d4b-91ef-d479c7a3d2b7" },
    data: { status: "Queued" }
  });
  console.log("Reset Ethan to Queued");
}
main().finally(() => prisma.$disconnect());
