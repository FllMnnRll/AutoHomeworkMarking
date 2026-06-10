import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { parseProcessingMeta } from "@/lib/pdfChunking";

const prisma = new PrismaClient();

export async function GET(req: NextRequest) {
  try {
    const assignmentId = req.nextUrl.searchParams.get("assignmentId");
    if (!assignmentId) {
      return NextResponse.json({ error: "Missing assignmentId" }, { status: 400 });
    }

    const submissions = await prisma.submission.findMany({
      where: { assignmentId },
      select: {
        id: true,
        status: true,
        processingMeta: true,
        student: { select: { name: true, studentId: true } },
      },
    });

    const activeChunked = submissions
      .map((s) => {
        const meta = parseProcessingMeta(s.processingMeta);
        if (!meta || s.status !== "Processing OCR") return null;
        return {
          submissionId: s.id,
          studentName: s.student.name,
          studentId: s.student.studentId,
          ...meta,
        };
      })
      .filter(Boolean);

    const queuedCount = submissions.filter((s) => s.status === "Queued").length;
    const processingCount = submissions.filter((s) => s.status === "Processing OCR").length;
    const completedCount = submissions.filter(
      (s) => s.status !== "Queued" && s.status !== "Processing OCR"
    ).length;

    const hasLargePdfWork = activeChunked.length > 0;

    let aggregateMessage = "";
    if (hasLargePdfWork) {
      const totalChunks = activeChunked.reduce((sum, a) => sum + (a?.totalChunks || 0), 0);
      const doneChunks = activeChunked.reduce((sum, a) => sum + (a?.completedChunks || 0), 0);
      aggregateMessage = `Processing ${activeChunked.length} large PDF(s) in parallel — chunk progress ${doneChunks}/${totalChunks} across active submissions.`;
    }

    return NextResponse.json({
      success: true,
      queuedCount,
      processingCount,
      completedCount,
      totalCount: submissions.length,
      hasLargePdfWork,
      aggregateMessage,
      activeChunked,
    });
  } catch (error) {
    console.error("Grading Progress Error:", error);
    return NextResponse.json({ error: "Failed to fetch grading progress" }, { status: 500 });
  }
}
