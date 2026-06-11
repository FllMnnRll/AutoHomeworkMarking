import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    // Since we don't have cascade delete configured on all relations in Prisma schema by default,
    // we need to delete slices, then submissions, then the assignment.
    
    // First, find all submissions
    const submissions = await prisma.submission.findMany({ where: { assignmentId: id } });
    const submissionIds = submissions.map(s => s.id);

    // Delete slices
    await prisma.slice.deleteMany({
      where: { submissionId: { in: submissionIds } }
    });

    // Delete submissions
    await prisma.submission.deleteMany({
      where: { assignmentId: id }
    });

    // Delete Class Analytics if exists
    await prisma.classAnalytics.deleteMany({
      where: { assignmentId: id }
    });

    // Delete assignment
    await prisma.assignment.delete({
      where: { id }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to delete assignment" }, { status: 500 });
  }
}
