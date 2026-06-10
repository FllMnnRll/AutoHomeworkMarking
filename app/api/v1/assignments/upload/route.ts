import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { processHomeworkSlice } from "@/lib/gradingEngine";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const assignmentId = formData.get("assignmentId") as string;
    const studentId = formData.get("studentId") as string; // in real life, extracted from OCR or form
    
    if (!file || !assignmentId || !studentId) {
      return NextResponse.json(
        { error: "Missing required fields (file, assignmentId, studentId)." },
        { status: 400 }
      );
    }
    
    // Save file locally to /public/uploads
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    const filename = `${Date.now()}_${file.name}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);
    const publicPath = `/uploads/${filename}`;

    // Create a new submission record in SQLite
    const submission = await prisma.submission.create({
      data: {
        student: { connect: { studentId: studentId } },
        assignment: { connect: { id: assignmentId } },
        status: "Queued",
        rawImagePath: publicPath
      }
    });

    return NextResponse.json({ 
      status: "success",
      message: "File ingested and queued for AI Math-Vision processing.",
      jobId: submission.id,
    }, { status: 202 });

  } catch (error) {
    console.error("Upload API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error during ingestion." },
      { status: 500 }
    );
  }
}
