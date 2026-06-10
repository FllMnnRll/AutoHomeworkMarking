import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import path from "path";
import { processHomeworkSlice } from "@/lib/gradingEngine";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { assignmentId, classId, tempFileName, finalMapping } = await req.json();

    if (!assignmentId || !tempFileName || !finalMapping || !Array.isArray(finalMapping)) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const tempFilePath = path.join(process.cwd(), "public", "uploads", "temp", tempFileName);
    if (!fs.existsSync(tempFilePath)) {
      return NextResponse.json({ error: "Temporary file not found or expired" }, { status: 404 });
    }

    const masterPdfBytes = fs.readFileSync(tempFilePath);
    const masterPdfDoc = await PDFDocument.load(masterPdfBytes);
    const totalPages = masterPdfDoc.getPageCount();

    const uploadDir = path.join(process.cwd(), "public", "uploads", assignmentId);
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    let successCount = 0;
    const tasks: { id: string, path: string }[] = [];

    // Process each student's assignment from the mapping
    for (const mapping of finalMapping) {
      if (!mapping.studentId) continue; // Skip if still unassigned
      
      const startIdx = Math.max(0, mapping.startPage - 1);
      const endIdx = Math.min(totalPages - 1, mapping.endPage - 1);
      
      if (startIdx > endIdx || startIdx >= totalPages) continue; // Invalid range

      // Create a new PDF for this student
      const studentPdf = await PDFDocument.create();
      const pageIndices = Array.from({ length: endIdx - startIdx + 1 }, (_, i) => startIdx + i);
      const copiedPages = await studentPdf.copyPages(masterPdfDoc, pageIndices);
      
      for (const page of copiedPages) {
        studentPdf.addPage(page);
      }

      const pdfBytes = await studentPdf.save();
      
      const fileName = `student_${mapping.studentId}_${Date.now()}.pdf`;
      const savePath = path.join(uploadDir, fileName);
      fs.writeFileSync(savePath, pdfBytes);

      const dbImagePath = `/uploads/${assignmentId}/${fileName}`;

      // Create submission record
      const submission = await prisma.submission.create({
        data: {
          student: { connect: { studentId: mapping.studentId } },
          assignment: { connect: { id: assignmentId } },
          status: "Queued",
          needsReview: false,
          rawImagePath: dbImagePath
        }
      });

      successCount++;
    }

    // Clean up temporary file
    try {
      fs.unlinkSync(tempFilePath);
    } catch(e) {
      console.warn("Failed to delete temp file:", e);
    }

    return NextResponse.json({ success: true, count: successCount });

  } catch (error) {
    console.error("Batch Confirm Error:", error);
    return NextResponse.json({ error: "Failed to confirm batch" }, { status: 500 });
  }
}
