import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const assignments = await prisma.assignment.findMany({
    include: {
      submissions: {
        include: {
          student: true
        }
      }
    }
  });

  console.log("=== Assignments & Submissions ===");
  for (const a of assignments) {
    console.log(`Assignment: ${a.title} (ID: ${a.id})`);
    console.log(`AI Mode: ${a.aiMode}, Subject: ${a.subject}`);
    console.log(`Solved Answer Key Cached: ${a.solvedAnswerKey ? "YES" : "NO"}`);
    console.log("Submissions:");
    for (const s of a.submissions) {
      console.log(`- Student: ${s.student.name} (ID: ${s.student.studentId}), Status: ${s.status}, Score: ${s.totalScore}%, SubmissionID: ${s.id}, Path: ${s.rawImagePath}`);
    }
    console.log("------------------------");
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
