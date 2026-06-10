// snapshot_after.js
// Pull the post-rerun aiScore and totalScore for the 9 baseline submissions.
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const ASSIGNMENT_ID = 'efff1085-dd55-4cdd-b12a-c8537e4c4d26';
const p = new PrismaClient();

(async () => {
  const assignment = await p.assignment.findUnique({
    where: { id: ASSIGNMENT_ID },
    include: {
      class: { select: { name: true } },
      submissions: {
        select: {
          id: true,
          status: true,
          totalScore: true,
          needsReview: true,
          errorMessage: true,
          rawImagePath: true,
          updatedAt: true,
          student: { select: { name: true, studentId: true } },
          slices: {
            select: { aiScore: true, finalScore: true, questionName: true },
            orderBy: { id: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!assignment) {
    console.error('Assignment not found:', ASSIGNMENT_ID);
    process.exit(1);
  }

  const snapshot = {
    capturedAt: new Date().toISOString(),
    assignment: {
      id: assignment.id,
      title: assignment.title,
      subject: assignment.subject,
      className: assignment.class?.name,
      aiMode: assignment.aiMode,
      evaluationType: assignment.evaluationType,
      hasSolvedKey: !!assignment.solvedAnswerKey,
      solvedKeyLen: assignment.solvedAnswerKey ? JSON.parse(assignment.solvedAnswerKey).length : 0,
    },
    submissions: assignment.submissions.map(s => ({
      id: s.id,
      student: s.student?.name,
      studentId: s.student?.studentId,
      rawImagePath: s.rawImagePath,
      status: s.status,
      totalScore: s.totalScore,
      needsReview: s.needsReview,
      errorMessage: s.errorMessage,
      updatedAt: s.updatedAt,
      aiScore: s.slices[0]?.aiScore ?? null,
      finalScore: s.slices[0]?.finalScore ?? null,
      sliceCount: s.slices.length,
      sliceScores: s.slices.map(sl => sl.aiScore),
    })),
  };

  const out = path.join(__dirname, 'after_5.1_hw_test.json');
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log('After snapshot saved to', out);
  console.log(JSON.stringify(snapshot.submissions.map(s => ({
    id: s.id.slice(0, 8),
    student: s.student,
    status: s.status,
    totalScore: s.totalScore,
    needsReview: s.needsReview,
    aiScore: s.aiScore,
    finalScore: s.finalScore,
    sliceCount: s.sliceCount,
    err: s.errorMessage ? s.errorMessage.slice(0, 40) : null,
  })), null, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
