import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.assignment.findMany({
    orderBy: { date: 'desc' },
    take: 2,
    include: {
      submissions: {
        include: { slices: true }
      }
    }
  });
  console.log(JSON.stringify(assignments, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
