import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { generateReasoning } from "@/lib/aiClient";

const prisma = new PrismaClient();

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    // 1. Fetch submission and its slices
    const submission = await prisma.submission.findUnique({
      where: { id },
      include: {
        student: true,
        assignment: true,
        slices: true
      }
    });

    if (!submission) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    const slice = submission.slices[0]; // Assuming 1 slice for now
    if (!slice || !slice.reasoningTree) {
      return NextResponse.json({ error: "No grading reasoning tree available for this submission yet." }, { status: 400 });
    }

    // 2. Prepare user prompt with grading data
    const userPrompt = `
      Student Name: ${submission.student.name}
      Student ID: ${submission.student.studentId}
      Assignment: ${submission.assignment.title}
      Subject: ${submission.assignment.subject}
      Total Score: ${submission.totalScore}%
      
      Grading Log Data:
      ${slice.reasoningTree}
    `;

    // 3. Prepare DeepSeek Prompt
    const systemPrompt = `
      You are an elite Educational Analyst.
      Analyze the provided student grading log for this assignment. 
      Identify exactly which concepts they did not master.
      Keep it extremely concise and direct (no long-winded paragraphs).
      
      CRITICAL RULES:
      1. MUST OUTPUT IN CHINESE (中文). Do not use English in the final JSON values.
      2. Wrap ALL math formulas in standard LaTeX using single \`$\` (for inline) or double \`$$\` (for block). DO NOT use \\\`\\(\\\` or \\\`\\[\\\`.
      
      You MUST output a valid JSON object matching exactly this schema:
      {
        "unmasteredConcepts": [
          {
            "concept": "String (e.g. 受力分析)",
            "mistakeDescription": "String (e.g. 忽略了斜面上的重力分量)"
          }
        ],
        "suggestions": "String (1-2 sentences of direct, actionable advice for the student)"
      }
    `;

    // 4. Call DeepSeek
    const dsResultRaw = await generateReasoning(systemPrompt, userPrompt, true);
    if (!dsResultRaw) throw new Error("Empty response from DeepSeek API");

    const analyticsJson = JSON.parse(dsResultRaw);

    // 5. Save to database
    const updatedSubmission = await prisma.submission.update({
      where: { id },
      data: {
        analytics: JSON.stringify(analyticsJson)
      }
    });

    return NextResponse.json({ success: true, analytics: analyticsJson });

  } catch (error) {
    console.error("Student Analytics Generation Error:", error);
    return NextResponse.json({ error: "Failed to generate student analytics" }, { status: 500 });
  }
}
