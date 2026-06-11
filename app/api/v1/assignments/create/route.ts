import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const classId = formData.get("classId") as string;
    const title = formData.get("title") as string;
    const uploadMethod = formData.get("uploadMethod") as string;
    const aiMode = formData.get("aiMode") as string;
    const subject = formData.get("subject") as string;
    const evaluationType = (formData.get("evaluationType") as string) || "Homework";
    const gradingDepth = (formData.get("gradingDepth") as string) || "Fast";
    const file = formData.get("file") as File | null;

    let answerKeyPath = null;

    if (file) {
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const filename = `answer_key_${Date.now()}_${file.name}`;
      const filePath = path.join(uploadsDir, filename);
      fs.writeFileSync(filePath, buffer);
      answerKeyPath = `/uploads/${filename}`;
    }

    let finalTitle = title;
    if (!finalTitle) {
      const targetClass = await prisma.class.findUnique({ where: { id: classId } });
      const className = targetClass ? targetClass.name : "Unknown Class";
      // E.g. "高二1班 - 2026/5/21 15:30:00"
      finalTitle = `${className} - ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
    }

    const assignment = await prisma.assignment.create({
      data: {
        title: finalTitle,
        classId,
        subject,
        aiMode,
        uploadMethod,
        answerKeyPath,
        evaluationType,
        gradingDepth,
      }
    });

    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    console.error("Error creating assignment:", error);
    return NextResponse.json({ error: "Failed to create assignment" }, { status: 500 });
  }
}
