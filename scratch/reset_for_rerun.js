// reset_for_rerun.js
// Reset the 9 baseline submissions: delete all slices, set status back to Queued.
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ASSIGNMENT_ID = 'efff1085-dd55-4cdd-b12a-c8537e4c4d26';

(async () => {
  // 1) Find the 9 submission IDs
  const subs = await p.submission.findMany({
    where: { assignmentId: ASSIGNMENT_ID },
    select: { id: true, status: true, rawImagePath: true, _count: { select: { slices: true } } },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`Found ${subs.length} submissions for assignment ${ASSIGNMENT_ID}.`);
  console.log('Current statuses:', subs.map(s => s.status).join(', '));

  if (subs.length !== 9) {
    console.error(`ERROR: expected 9 submissions, found ${subs.length}. Aborting.`);
    process.exit(1);
  }

  const ids = subs.map(s => s.id);

  // 2) Delete all slices for these submissions
  const deletedSlices = await p.slice.deleteMany({
    where: { submissionId: { in: ids } },
  });
  console.log(`Deleted ${deletedSlices.count} slices.`);

  // 3) Reset submission fields
  const updated = await p.submission.updateMany({
    where: { id: { in: ids } },
    data: {
      status: 'Queued',
      needsReview: false,
      totalScore: null,
      errorMessage: null,
      updatedAt: new Date(),
    },
  });
  console.log(`Reset ${updated.count} submissions to Queued.`);

  // 4) Verify
  const after = await p.submission.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, totalScore: true, needsReview: true, errorMessage: true, _count: { select: { slices: true } } },
    orderBy: { createdAt: 'asc' },
  });
  console.log('=== POST-RESET STATE ===');
  for (const s of after) {
    console.log(`  ${s.id.slice(0, 8)} status=${s.status} score=${s.totalScore} needsReview=${s.needsReview} slices=${s._count.slices} err=${s.errorMessage ? s.errorMessage.slice(0, 30) : 'null'}`);
  }

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
