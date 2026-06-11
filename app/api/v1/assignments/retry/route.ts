import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processHomeworkSlice } from "@/lib/gradingEngine";

export async function POST(req: NextRequest) {
  try {
    const { submissionId } = await req.json();

    if (!submissionId) {
      return NextResponse.json({ error: "Missing submissionId" }, { status: 400 });
    }

    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: { student: true }
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    let dbImagePath = submission.rawImagePath;

    // Fallback for submissions created before rawImagePath was added to schema
    if (!dbImagePath) {
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(process.cwd(), "public", "uploads", submission.assignmentId);
      
      if (fs.existsSync(uploadDir)) {
        const files = fs.readdirSync(uploadDir);
        const studentFile = files.find((f: string) => f.startsWith(`student_${submission.student.studentId}_`));
        if (studentFile) {
          dbImagePath = `/uploads/${submission.assignmentId}/${studentFile}`;
        }
      }
    }

    if (!dbImagePath) {
      return NextResponse.json({ error: "Original image path not found. Cannot retry." }, { status: 400 });
    }

    // Reset status to Queued
    await prisma.submission.update({
      where: { id: submissionId },
      data: { 
        status: "Queued", 
        needsReview: false,
        totalScore: null,
        rawImagePath: dbImagePath // save it for future
      }
    });

    // Optionally delete old slices if they exist so it's a clean retry
    await prisma.slice.deleteMany({
      where: { submissionId }
    });

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Retry Error:", error);
    return NextResponse.json({ error: "Failed to retry" }, { status: 500 });
  }
}
