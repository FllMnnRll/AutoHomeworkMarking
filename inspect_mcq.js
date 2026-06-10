const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const slice = await prisma.slice.findFirst({
    orderBy: { createdAt: 'desc' }
  });
  if (slice && slice.reasoningTree) {
    const tree = JSON.parse(slice.reasoningTree);
    console.log(JSON.stringify(tree.filter(q => q.questionNumber === "3" || q.questionNumber === "4" || q.questionNumber === "3." || q.questionNumber === "4."), null, 2));
  } else {
    console.log("No reasoning tree found.");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
