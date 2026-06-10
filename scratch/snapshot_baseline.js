// snapshot_baseline.js
// Saves the current aiScore values for the "hw5.1 test" assignment as the regression baseline.
// Run BEFORE making optimization changes so we can later compare.
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
          student: { select: { name: true, studentId: true } },
          slices: { select: { aiScore: true, finalScore: true, questionName: true } },
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
      aiScore: s.slices[0]?.aiScore ?? null,
      finalScore: s.slices[0]?.finalScore ?? null,
    })),
  };

  const out = path.join(__dirname, 'baseline_5.1_hw_test.json');
  fs.writeFileSync(out, JSON.stringify(snapshot, null, 2));
  console.log('Baseline snapshot saved to', out);
  console.log(JSON.stringify(snapshot, null, 2));
  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
