import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { Type } from "@google/genai";
import { generateContentWithFallback } from "@/lib/aiClient";
import fs from "fs";
import path from "path";

const prisma = new PrismaClient();

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

    // 3. Prepare Gemini API Call
    const prompt = `
      Attached is a multi-page PDF containing handwritten assignments from an entire class of students.
      The students officially enrolled in this class are: [${studentListString}].
      
      Your task is to analyze the document and determine the page boundaries for EACH student's assignment.
      Students typically write their name on the first page of their submission.
      
      Instructions:
      1. Identify the start and end pages (1-indexed) for each distinct homework submission.
      2. Match the name written on the submission to one of the officially enrolled students.
      3. If a submission's name is completely illegible or does not match any enrolled student, mark the studentName as "Unknown" and leave the studentId empty.
      
      Return a JSON object containing two arrays: 'matched' (submissions successfully mapped to a known student) and 'unmatched' (submissions with an unknown or missing name).
    `;

    const schema = {
      type: Type.OBJECT,
      properties: {
        matched: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              studentId: { type: Type.STRING },
              studentName: { type: Type.STRING },
              startPage: { type: Type.INTEGER },
              endPage: { type: Type.INTEGER }
            },
            required: ["studentId", "studentName", "startPage", "endPage"]
          }
        },
        unmatched: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              startPage: { type: Type.INTEGER },
              endPage: { type: Type.INTEGER }
            },
            required: ["startPage", "endPage"]
          }
        }
      },
      required: ["matched", "unmatched"]
    };

    const parts = [
      {
        inlineData: {
          data: buffer.toString("base64"),
          mimeType: file.type || "application/pdf"
        }
      },
      { text: prompt }
    ];

    const response = await generateContentWithFallback(parts, schema, "BatchAnalyze");
    const resultText = response?.text;
    if (!resultText) throw new Error("Empty response from Gemini API");
    
    let cleanJson = resultText.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    cleanJson = cleanJson.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
    }

    const aiResult = JSON.parse(cleanJson);

    return NextResponse.json({ 
      success: true, 
      tempFileName,
      matched: aiResult.matched || [],
      unmatched: aiResult.unmatched || [],
      allStudents: students
    });

  } catch (error) {
    console.error("Batch Analyze Error:", error);
    return NextResponse.json({ error: "Failed to analyze batch" }, { status: 500 });
  }
}
