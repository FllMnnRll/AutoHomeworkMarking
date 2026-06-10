const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  console.log("Attempting to write to Prisma database...");
  const start = Date.now();
  const testSub = await prisma.submission.findFirst();
  if (testSub) {
    console.log("Read success:", testSub.id);
    console.log("Updating updated_at...");
    await prisma.submission.update({
      where: { id: testSub.id },
      data: { updatedAt: new Date() }
    });
    console.log(`Update success! Took ${Date.now() - start}ms`);
  } else {
    console.log("No submissions to update.");
  }
}
main().catch(e => console.error("Error writing:", e)).finally(() => prisma.$disconnect());
