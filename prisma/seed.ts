import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  // 1. Create an Assignment
  const assignment1 = await prisma.assignment.create({
    data: {
      title: 'AP Physics 1 - Unit 1 1D Motion (Assignment #1)',
      date: new Date('2024-10-05T10:15:00Z')
    }
  })
  
  const assignment2 = await prisma.assignment.create({
    data: {
      title: 'AP Physics 1 - Unit 1 Kinematics (Assignment #2)',
      date: new Date('2024-10-15T14:00:00Z')
    }
  })
  
  const assignment3 = await prisma.assignment.create({
    data: {
      title: 'AP Physics 1 - Unit 2 Dynamics (Assignment #3)',
      date: new Date('2024-10-24T09:30:00Z')
    }
  })

  // 2. Create Students
  const students = [
    { studentId: '2024012', name: 'John Doe', classId: 'AP Physics 1' },
    { studentId: '2024013', name: 'Jane Smith', classId: 'AP Physics 1' },
    { studentId: '2024014', name: 'Alex Johnson', classId: 'AP Physics 1' },
    { studentId: '2024015', name: 'Sarah Williams', classId: 'AP Physics 1' },
    { studentId: '2024016', name: 'Michael Brown', classId: 'AP Physics 1' },
  ]

  const createdStudents = []
  for (const s of students) {
    const created = await prisma.student.upsert({
      where: { studentId: s.studentId },
      update: {},
      create: s,
    })
    createdStudents.push(created)
  }

  // 3. Create Submissions and Slices for Assignment 3
  const submissionsData = [
    { studentId: '2024012', totalScore: 57, status: 'Needs Review', needsReview: true },
    { studentId: '2024013', totalScore: 100, status: 'Graded', needsReview: false },
    { studentId: '2024014', totalScore: 86, status: 'Graded', needsReview: false },
    { studentId: '2024015', totalScore: 29, status: 'Needs Review', needsReview: true },
    { studentId: '2024016', totalScore: null, status: 'Processing OCR', needsReview: false },
  ]

  for (const sub of submissionsData) {
    const dbStudent = createdStudents.find(s => s.studentId === sub.studentId)
    
    const submission = await prisma.submission.create({
      data: {
        studentId: dbStudent!.id,
        assignmentId: assignment3.id,
        totalScore: sub.totalScore,
        status: sub.status,
        needsReview: sub.needsReview,
      }
    })

    // If it's John Doe (2024012), create a detailed Slice for the Review Console mock
    if (sub.studentId === '2024012') {
      await prisma.slice.create({
        data: {
          submissionId: submission.id,
          questionName: 'Kinematics Q3',
          rawImagePath: '/mockup_slice.png',
          ocrText: 'Given: $m = 5kg$, $v_0 = 10m/s$, $\\mu_k = 0.2$\\n\\n$\\sum F = ma$\\n$-f_k = ma$\\n$-(\\mu_k \\cdot mg) = 5a \\Rightarrow -0.2 \\cdot 5 \\cdot 10 = 5a \\Rightarrow -10 = 5a \\Rightarrow a = -2.5$\\n$v = v_0 + at \\Rightarrow 0 = 10 - 2.5t \\Rightarrow t = 4s$',
          reasoningTree: JSON.stringify([
            {
              step: 'Formula Identification (State)',
              extracted: '\\sum F = ma',
              status: 'correct',
              points: '+29%',
              message: null
            },
            {
              step: 'Substitution & Calculation',
              expected: '-10 = 5a \\Rightarrow a = -2.0',
              actual: 'a = -2.5',
              status: 'error',
              points: '-29%',
              message: 'AI detected a computation error in substitution.'
            },
            {
              step: 'Final Answer (Determine)',
              extracted: 't = 4s',
              status: 'ecf',
              points: '+29% (ECF)',
              message: 'The methodology for kinematic derivation is fully correct given the input. No further deduction.'
            }
          ]),
          aiScore: 57,
          finalScore: 57
        }
      })
    }
  }

  console.log('Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
