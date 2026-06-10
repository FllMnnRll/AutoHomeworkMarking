const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const assignmentId = "ca5c6d27-1b12-4dcb-947b-331a42ddcf9e";
  
  const analytics = await prisma.classAnalytics.findUnique({
    where: { assignmentId }
  });

  if (analytics) {
    console.log("=== Class Analytics ===");
    console.log(`ID: ${analytics.id}`);
    console.log(`Status: ${analytics.status}`);
    console.log(`Concepts: ${analytics.concepts ? analytics.concepts.substring(0, 100) + "..." : "None"}`);
    console.log(`Error Clusters: ${analytics.errorClusters ? analytics.errorClusters.substring(0, 100) + "..." : "None"}`);
    console.log(`Remediation: ${analytics.remediation ? analytics.remediation.substring(0, 100) + "..." : "None"}`);
  } else {
    console.log("No class analytics record found for this assignment.");
  }
}
main().finally(() => prisma.$disconnect());
