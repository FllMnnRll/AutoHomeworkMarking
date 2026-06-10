const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.submission.update({
    where: { id: "0088a1c0-297b-41dd-893a-50e3363fa85b" },
    data: { status: "Queued" }
  });
  console.log("Reset Tiger to Queued");
}
main().finally(() => prisma.$disconnect());
