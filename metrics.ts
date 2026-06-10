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

  if (assignments.length < 2) {
    console.log("Not enough assignments found.");
    return;
  }

  const recent = assignments[0];
  const older = assignments[1];

  function getMetrics(assignment: any) {
    const submissions = assignment.submissions;
    const count = submissions.length;
    let totalDurationMs = 0;
    let errorCount = 0;
    let errors: string[] = [];
    let avgScore = 0;

    submissions.forEach((sub: any) => {
      const duration = new Date(sub.updatedAt).getTime() - new Date(sub.createdAt).getTime();
      totalDurationMs += duration;
      
      if (sub.status.includes("Error")) {
        errorCount++;
        if (sub.errorMessage) errors.push(sub.errorMessage);
      }
      
      avgScore += sub.totalScore || 0;
    });

    return {
      title: assignment.title,
      date: assignment.date,
      count,
      avgDurationMs: count > 0 ? totalDurationMs / count : 0,
      totalDurationMs,
      errorCount,
      errors: Array.from(new Set(errors)),
      avgScore: count > 0 ? avgScore / count : 0
    };
  }

  const recentMetrics = getMetrics(recent);
  const olderMetrics = getMetrics(older);

  console.log("=== RECENT ASSIGNMENT (After Optimizations) ===");
  console.log(JSON.stringify(recentMetrics, null, 2));

  console.log("\n=== OLDER ASSIGNMENT (Before Optimizations) ===");
  console.log(JSON.stringify(olderMetrics, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
