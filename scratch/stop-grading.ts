import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
  try {
    const result = await prisma.submission.updateMany({
      where: {
        status: { in: ["Queued", "Processing OCR"] }
      },
      data: { 
        status: "Error during OCR",
        errorMessage: "Task manually stopped by teacher."
      }
    });
    console.log(`Successfully stopped ${result.count} submission tasks.`);

    const analyticsResult = await prisma.classAnalytics.updateMany({
      where: { status: "Generating" },
      data: { status: "Error" }
    });
    console.log(`Successfully stopped ${analyticsResult.count} class analytics tasks.`);
  } catch (err) {
    console.error("Failed to stop tasks:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
