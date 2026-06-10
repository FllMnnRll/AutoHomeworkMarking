const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanDB() {
  console.log("Cleaning database...");
  await prisma.slice.deleteMany({});
  await prisma.submission.deleteMany({});
  await prisma.assignment.deleteMany({});
  await prisma.student.deleteMany({});
  await prisma.class.deleteMany({});
  console.log("Database cleared successfully!");
}

cleanDB()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
