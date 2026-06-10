const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clean() {
  const badSlices = await prisma.slice.findMany({
    where: { aiScore: null }
  });
  
  for (const slice of badSlices) {
    console.log(`Deleting slice ${slice.id} and its submission ${slice.submissionId}`);
    await prisma.slice.delete({ where: { id: slice.id } });
    try {
      await prisma.submission.delete({ where: { id: slice.submissionId } });
    } catch(e) { console.log('submission already deleted or error', e.message); }
  }
  console.log("Cleanup done.");
}

clean().catch(console.error).finally(() => prisma.$disconnect());
