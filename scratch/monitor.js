const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const latestAssignment = await prisma.assignment.findFirst({
    orderBy: { date: 'desc' },
    include: {
      class: true,
      analytics: true
    }
  });

  if (!latestAssignment) {
    console.log("No assignments found.");
    return;
  }

  console.log(`=== Latest Assignment: ${latestAssignment.title} (${latestAssignment.id}) ===`);
  console.log(`Class: ${latestAssignment.class?.name || "None"}`);
  console.log(`AI Mode: ${latestAssignment.aiMode}`);
  console.log(`Class Analytics Status: ${latestAssignment.analytics ? latestAssignment.analytics.status : "None"}`);

  const submissions = await prisma.submission.findMany({
    where: { assignmentId: latestAssignment.id },
    include: { student: true }
  });

  console.log(`\n=== Submissions (${submissions.length}) ===`);
  const statusCounts = {};
  submissions.forEach(sub => {
    statusCounts[sub.status] = (statusCounts[sub.status] || 0) + 1;
    console.log(`- Student: ${sub.student.name} (${sub.student.studentId}), Status: ${sub.status}, Score: ${sub.totalScore !== null ? sub.totalScore + '%' : 'Pending'}, Has student analytics: ${sub.analytics ? "Yes" : "No"}`);
  });

  console.log(`\nStatus Summary:`, statusCounts);
}

main().catch(console.error).finally(() => prisma.$disconnect());
