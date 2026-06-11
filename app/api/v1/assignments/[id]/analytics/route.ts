import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateReasoning } from "@/lib/aiClient";

// How many per-student analytics AI calls run concurrently.
const STUDENT_ANALYTICS_CONCURRENCY = 4;

// GET: Check the current status of Class Analytics
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    const analytics = await prisma.classAnalytics.findUnique({
      where: { assignmentId: id }
    });

    if (!analytics) {
      return NextResponse.json({ status: "None" });
    }

    return NextResponse.json({
      status: analytics.status,
      concepts: analytics.concepts ? JSON.parse(analytics.concepts) : null,
      errorClusters: analytics.errorClusters ? JSON.parse(analytics.errorClusters) : null,
      remediation: analytics.remediation ? JSON.parse(analytics.remediation) : null
    });
  } catch (error) {
    console.error("GET Analytics Error:", error);
    return NextResponse.json({ error: "Failed to get analytics status" }, { status: 500 });
  }
}

// POST: Trigger background Class Analytics generation
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    // Check if already generating
    const existing = await prisma.classAnalytics.findUnique({
      where: { assignmentId: id }
    });

    if (existing && existing.status === "Generating") {
      return NextResponse.json({ success: true, status: "Generating", message: "Already generating" });
    }

    // Set status to Generating in the database (acts as a lock)
    await prisma.classAnalytics.upsert({
      where: { assignmentId: id },
      update: { 
        status: "Generating",
        concepts: null,
        errorClusters: null,
        remediation: null
      },
      create: { 
        assignmentId: id,
        status: "Generating"
      }
    });

    // Run the DeepSeek API call asynchronously in the background so the HTTP request can return immediately
    runClassAnalyticsInBg(id).catch(err => {
      console.error("[Background Analytics] Execution failed for assignment:", id, err);
      // Reset status to Error on failure so it stops looping and the user can manually retry
      prisma.classAnalytics.update({ 
        where: { assignmentId: id },
        data: { status: "Error" }
      }).catch(e => {});
    });

    return NextResponse.json({ success: true, status: "Generating" });

  } catch (error) {
    console.error("POST Analytics Error:", error);
    return NextResponse.json({ error: "Failed to start analytics generation" }, { status: 500 });
  }
}

// Background worker function
async function runClassAnalyticsInBg(id: string) {
  console.log(`[Background Analytics] Starting analytics compilation for assignment ${id}...`);

  const assignment = await prisma.assignment.findUnique({
    where: { id },
    include: {
      submissions: {
        where: { status: 'Graded' }, // only graded submissions
        include: { slices: true }
      }
    }
  });

  if (!assignment) {
    throw new Error("Assignment not found");
  }

  if (assignment.submissions.length === 0) {
    throw new Error("No graded submissions available for analysis");
  }

  // Extract and compile all reasoning trees
  const classData = assignment.submissions.map(sub => {
    const slice = sub.slices[0];
    if (!slice || !slice.reasoningTree) return null;
    return `[Student: ${sub.studentId}]\nScore: ${slice.aiScore}%\nLogic Pipeline:\n${slice.reasoningTree}`;
  }).filter(Boolean).join("\n\n---\n\n");

  if (!classData) {
    throw new Error("No reasoning data found in graded submissions");
  }

  const systemPrompt = `
    You are an expert Educational Data Analyst. 
    I will provide you with the detailed step-by-step grading logs of an entire class of students for an assignment.
    
    Your task is to analyze all their mistakes, grading logic, and scores to synthesize a "Class Analytics Dashboard".
    
    CRITICAL RULES:
    1. MUST OUTPUT IN CHINESE (中文). Do not use English in the final JSON values.
    2. Wrap ALL math formulas in standard LaTeX using single \`$\` (for inline) or double \`$$\` (for block). DO NOT use \\\`\\(\\\` or \\\`\\[\\\`.
    
    You MUST output a valid JSON object matching exactly this schema:
    {
      "unmasteredConcepts": [
        {
          "name": "String (e.g. 动能定理的应用)",
          "description": "String (Brief description of why the class struggled with this)"
        }
      ],
      "errorClusters": [
        {
          "question": "String (e.g. Q3 or 第五题)",
          "description": "String (Brief description of the common mistake)",
          "affectedCount": "Number (How many students made this exact mistake)",
          "severity": "String (must be exactly 'red' or 'amber')"
        }
      ],
      "remediation": {
        "vulnerability": "String (One sentence summarizing the biggest class-wide failing)",
        "actionPlan": "String (Actionable advice for the teacher's next whiteboard session)"
      }
    }
  `;

  // Call DeepSeek for Class Analytics, forcing disableFallback = true
  const dsResultRaw = await generateReasoning(systemPrompt, classData, true, "deepseek-v4-flash", false, true);
  if (!dsResultRaw) throw new Error("Empty response from DeepSeek API");
  let analyticsJson;
  try {
    analyticsJson = JSON.parse(dsResultRaw);
  } catch (firstErr) {
    // Try to auto-fix trailing commas and unescaped newlines which are common LLM JSON mistakes
    try {
      let fixedJson = dsResultRaw
        .replace(/,\s*}/g, '}')
        .replace(/,\s*\]/g, ']')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\t/g, '\\t');

      // Revert the escaped newlines outside of string values by unescaping structural JSON elements
      fixedJson = fixedJson.replace(/\\n\s*}/g, '\n}').replace(/\\n\s*\]/g, '\n]').replace(/\\n\s*"/g, '\n"');

      analyticsJson = JSON.parse(fixedJson);
      console.warn("[Background Analytics] Raw JSON was invalid but auto-fixed version parsed successfully.");
    } catch (e) {
      console.error("[Background Analytics] JSON Parse Error! Raw output was:");
      console.error("-----RAW START-----\n" + dsResultRaw + "\n-----RAW END-----");
      throw new Error("Failed to parse JSON from AI response");
    }
  }

  // Save the result back to the database, setting status to Completed
  // Note: Since we changed 'concepts' to 'unmasteredConcepts' in the prompt but the DB schema still uses 'concepts', we map it back to the DB column.
  await prisma.classAnalytics.update({
    where: { assignmentId: id },
    data: {
      status: "Completed",
      concepts: JSON.stringify(analyticsJson.unmasteredConcepts),
      errorClusters: JSON.stringify(analyticsJson.errorClusters),
      remediation: JSON.stringify(analyticsJson.remediation)
    }
  });

  console.log(`[Background Analytics] Completed Class Analytics for assignment ${id}. Now processing Individual Student Analytics...`);

  // 2. Generate individual student analytics with bounded parallelism
  //    (N sequential AI calls was the single biggest wait in this pipeline).
  const pendingSubs = assignment.submissions.filter(sub => {
    if (sub.analytics) return false; // Skip if already generated
    const slice = sub.slices[0];
    return !!(slice && slice.reasoningTree);
  });

  const studentSystemPrompt = `
    You are an elite Educational Analyst.
    Analyze the provided student grading log for this assignment. 
    Identify exactly which concepts they did not master.
    Keep it extremely concise and direct.
    
    CRITICAL RULES:
    1. MUST OUTPUT IN CHINESE (中文). Do not use English in the final JSON values.
    2. Wrap ALL math formulas in standard LaTeX using single \`$\` (for inline) or double \`$$\` (for block). DO NOT use \\\`\\(\\\` or \\\`\\[\\\`.
    
    You MUST output a valid JSON object matching exactly this schema:
    {
      "unmasteredConcepts": [
        {
          "concept": "String",
          "mistakeDescription": "String"
        }
      ],
      "suggestions": "String"
    }
  `;

  const subQueue = [...pendingSubs];
  const workers = Array.from(
    { length: Math.min(STUDENT_ANALYTICS_CONCURRENCY, subQueue.length) },
    async () => {
      while (subQueue.length > 0) {
        const sub = subQueue.shift();
        if (!sub) break;

        const slice = sub.slices[0];
        const studentUserPrompt = `
          Student ID: ${sub.studentId}
          Total Score: ${slice.aiScore || 0}%
          
          Grading Log Data:
          ${slice.reasoningTree}
        `;

        try {
          console.log(`[Background Analytics] Generating Student Analytics for ${sub.studentId}...`);
          const studentRaw = await generateReasoning(studentSystemPrompt, studentUserPrompt, true, "deepseek-v4-flash", false, true);
          if (studentRaw) {
            const studentJson = JSON.parse(studentRaw);
            await prisma.submission.update({
              where: { id: sub.id },
              data: { analytics: JSON.stringify(studentJson) }
            });
          }
        } catch (err: any) {
          console.error(`[Background Analytics] Failed to generate student analytics for ${sub.id}:`, err.message);
          // We don't throw here so we can continue processing other students
        }
      }
    }
  );
  await Promise.all(workers);

  console.log(`[Background Analytics] Completed ALL analytics compilation for assignment ${id}.`);
}
