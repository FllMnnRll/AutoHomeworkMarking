const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // 1) Find the assignment
  const assignments = await p.assignment.findMany({
    where: {
      OR: [
        { title: { contains: '5.1' } },
        { title: { contains: 'hw test' } },
        { title: { contains: 'HW test' } },
        { title: { contains: 'HW Test' } },
        { title: { contains: '5.1 hw' } },
        { title: { contains: '5.1 HW' } },
        { title: { contains: '5.1 test' } },
        { title: { contains: '5.1 Test' } },
      ],
    },
    include: {
      class: true,
      submissions: {
        select: {
          id: true,
          status: true,
          totalScore: true,
          needsReview: true,
          rawImagePath: true,
          errorMessage: true,
          student: { select: { id: true, name: true, studentId: true } },
          slices: { select: { id: true, aiScore: true, finalScore: true, questionName: true, reasoningTree: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: { date: 'desc' },
  });

  console.log('=== MATCHING ASSIGNMENTS ===');
  console.log(JSON.stringify(assignments.map(a => ({
    id: a.id,
    title: a.title,
    subject: a.subject,
    className: a.class?.name,
    classId: a.classId,
    aiMode: a.aiMode,
    evaluationType: a.evaluationType,
    date: a.date,
    hasSolvedKey: !!a.solvedAnswerKey,
    solvedKeyLen: a.solvedAnswerKey ? JSON.parse(a.solvedAnswerKey).length : 0,
    submissionsCount: a.submissions.length,
    submissions: a.submissions.map(s => ({
      subId: s.id,
      student: s.student?.name,
      sid: s.student?.studentId,
      status: s.status,
      totalScore: s.totalScore,
      needsReview: s.needsReview,
      error: s.errorMessage,
      sliceCount: s.slices.length,
      sliceAiScore: s.slices[0]?.aiScore,
      sliceFinal: s.slices[0]?.finalScore,
    })),
  })), null, 2));

  // 2) Also list all physics classes
  const physicsClasses = await p.class.findMany({
    where: { name: { contains: 'physic' } },
    select: { id: true, name: true, _count: { select: { assignments: true } } },
  });
  console.log('\n=== PHYSICS CLASSES ===');
  console.log(JSON.stringify(physicsClasses, null, 2));

  // 3) Latest assignments per class
  const recent = await p.assignment.findMany({
    take: 15,
    orderBy: { date: 'desc' },
    include: { class: { select: { name: true } } },
  });
  console.log('\n=== LATEST 15 ASSIGNMENTS ===');
  console.log(JSON.stringify(recent.map(a => ({
    id: a.id,
    title: a.title,
    subject: a.subject,
    className: a.class?.name,
    date: a.date,
    aiMode: a.aiMode,
  })), null, 2));

  await p.$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
