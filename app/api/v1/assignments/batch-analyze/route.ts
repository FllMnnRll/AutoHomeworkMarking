import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyzeBatchPdf } from "@/lib/batchAnalyze";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const classId = formData.get("classId") as string;

    if (!file || !classId) {
      return NextResponse.json({ error: "Missing file or classId" }, { status: 400 });
    }

    // 1. Fetch all students in the class
    const students = await prisma.student.findMany({
      where: { classId },
      select: { id: true, studentId: true, name: true }
    });

    if (students.length === 0) {
      return NextResponse.json({ error: "No students found in this class" }, { status: 400 });
    }

    const studentListString = students.map(s => `${s.name} (ID: ${s.studentId})`).join(", ");

    // 2. Read the file into a buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save it temporarily so we can split it in the confirm step without re-uploading
    const tempFileName = `batch-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "temp");
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    
    const tempFilePath = path.join(uploadDir, tempFileName);
    fs.writeFileSync(tempFilePath, buffer);

    const analyzeResult = await analyzeBatchPdf(buffer, studentListString);

    return NextResponse.json({ 
      success: true, 
      tempFileName,
      matched: analyzeResult.matched,
      unmatched: analyzeResult.unmatched,
      allStudents: students,
      pdfChunked: analyzeResult.pdfChunked,
      totalChunks: analyzeResult.totalChunks,
      fileSizeMb: analyzeResult.fileSizeMb,
      chunkMessage: analyzeResult.message,
    });

  } catch (error) {
    console.error("Batch Analyze Error:", error);
    return NextResponse.json({ error: "Failed to analyze batch" }, { status: 500 });
  }
}
