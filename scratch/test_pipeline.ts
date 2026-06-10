import { PrismaClient } from '@prisma/client';
import { processHomeworkSlice } from '../lib/gradingEngine';

const prisma = new PrismaClient();

async function main() {
  const assignmentId = "ca5c6d27-1b12-4dcb-947b-331a42ddcf9e";
  const sub1Id = "0088a1c0-297b-41dd-893a-50e3363fa85b"; // Tiger
  const sub2Id = "238162ad-ace3-4d4b-91ef-d479c7a3d2b7"; // Ethan

  // Clear solvedAnswerKey & set evaluationType to Homework
  await prisma.assignment.update({
    where: { id: assignmentId },
    data: { solvedAnswerKey: null, evaluationType: "Homework" }
  });
  console.log("Cleared cached solvedAnswerKey and set evaluationType to Homework for assignment.");

  // Delete existing slices for these submissions to avoid duplicates or database constraint issues
  await prisma.slice.deleteMany({
    where: { submissionId: { in: [sub1Id, sub2Id] } }
  });
  console.log("Deleted old slice records.");

  // Reset status to Pending
  await prisma.submission.update({
    where: { id: sub1Id },
    data: { status: 'Pending', totalScore: null }
  });
  await prisma.submission.update({
    where: { id: sub2Id },
    data: { status: 'Pending', totalScore: null }
  });
  console.log("Reset submissions status to Pending.");

  console.log("\n=== STEP 2: Running grading for Tiger (First Submission - Phase A) ===");
  console.log("This will generate the Master Answer Key using deepseek-v4-pro with thinking enabled...");
  const t1Start = Date.now();
  const sub1 = await prisma.submission.findUnique({ where: { id: sub1Id } });
  if (!sub1 || !sub1.rawImagePath) throw new Error("Tiger submission or rawImagePath not found");
  
  const res1 = await processHomeworkSlice(sub1Id, sub1.rawImagePath);
  const t1End = Date.now();
  console.log(`Tiger grading result: ${res1.success ? "SUCCESS" : "FAILED"}`);
  console.log(`Time taken: ${((t1End - t1Start) / 1000).toFixed(1)}s`);
  if (res1.success) {
    console.log(`Score: ${res1.aiResult?.totalScore}%`);
  }

  console.log("\n=== STEP 3: Verifying Cached Master Answer Key ===");
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
  if (!assignment?.solvedAnswerKey) {
    console.error("FAIL: solvedAnswerKey was not cached!");
  } else {
    console.log("SUCCESS: solvedAnswerKey is cached!");
    const key = JSON.parse(assignment.solvedAnswerKey);
    console.log(`Number of questions in Master Answer Key: ${key.length}`);
    console.log("Sample question cached details:");
    console.log(JSON.stringify(key[0], null, 2));
  }

  console.log("\n=== STEP 4: Running grading for Ethan (Second Submission - Phase B) ===");
  console.log("This will use cached comparative grading via deepseek-v4-flash without thinking...");
  const t2Start = Date.now();
  const sub2 = await prisma.submission.findUnique({ where: { id: sub2Id } });
  if (!sub2 || !sub2.rawImagePath) throw new Error("Ethan submission or rawImagePath not found");

  const res2 = await processHomeworkSlice(sub2Id, sub2.rawImagePath);
  const t2End = Date.now();
  console.log(`Ethan grading result: ${res2.success ? "SUCCESS" : "FAILED"}`);
  console.log(`Time taken: ${((t2End - t2Start) / 1000).toFixed(1)}s`);
  if (res2.success) {
    console.log(`Score: ${res2.aiResult?.totalScore}%`);
  }

  console.log("\n=== Performance comparison ===");
  const speedup = ((t1End - t1Start) / (t2End - t2Start)).toFixed(1);
  console.log(`Tiger (heavy R1-style grading): ${((t1End - t1Start) / 1000).toFixed(1)}s`);
  console.log(`Ethan (fast comparative grading): ${((t2End - t2Start) / 1000).toFixed(1)}s`);
  console.log(`Speedup factor: ${speedup}x faster!`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
