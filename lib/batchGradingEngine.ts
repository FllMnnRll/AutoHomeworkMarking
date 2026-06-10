import { PrismaClient, Submission, Assignment } from "@prisma/client";
import fs from "fs";
import path from "path";
import { getOrTranscribePage, getPagesFromFile, processHomeworkSlice } from "./gradingEngine";
import { generateReasoning } from "./aiClient";
import { isOversizedPdf, getFileSizeMb } from "./pdfChunking";
import { runChunkedParallelOcr } from "./chunkedGrading";

const prisma = new PrismaClient();

export async function processBatchHomework(submissionIds: string[]) {
  if (submissionIds.length === 0) return [];

  console.log(`[BatchGradingEngine] Processing batch of ${submissionIds.length} submissions...`);

  // 1. Fetch all submissions
  const submissions = await prisma.submission.findMany({
    where: { id: { in: submissionIds } },
    include: { assignment: true }
  });

  if (submissions.length === 0) return [];

  const assignment = submissions[0].assignment;
  
  // 2. Check if we have a Master Key. If not, process the first one normally to generate it.
  let solvedKeyStr = assignment.solvedAnswerKey;
  let remainingSubmissions = [...submissions];

  if ((!solvedKeyStr || JSON.parse(solvedKeyStr).length === 0) && assignment.aiMode !== "AnswerKey") {
    console.log(`[BatchGradingEngine] No Master Key found. Processing first submission sequentially to generate key.`);
    const firstSub = remainingSubmissions.shift();
    if (firstSub && firstSub.rawImagePath) {
      await processHomeworkSlice(firstSub.id, firstSub.rawImagePath);
    }
    
    // Refetch assignment to get the newly generated key
    const updatedAssignment = await prisma.assignment.findUnique({
      where: { id: assignment.id }
    });
    solvedKeyStr = updatedAssignment?.solvedAnswerKey || null;
  }

  if (remainingSubmissions.length === 0) {
    return [{ success: true }];
  }

  // Parse the key
  let solvedAnswerKey: any[] = [];
  if (solvedKeyStr) {
    try {
      solvedAnswerKey = JSON.parse(solvedKeyStr);
    } catch (e) {
      console.warn("[BatchGradingEngine] Failed to parse cached solvedAnswerKey:", e);
    }
  }

  const hasCachedKey = solvedAnswerKey && solvedAnswerKey.length > 0;

  // 3. Parallel OCR for all remaining submissions
  console.log(`[BatchGradingEngine] Running parallel Targeted OCR for ${remainingSubmissions.length} submissions...`);
  
  type OcrResult = { id: string, markdown: string, rawImagePath: string };
  const ocrResults: OcrResult[] = [];

  await Promise.all(
    remainingSubmissions.map(async (sub) => {
      try {
        if (!sub.rawImagePath) throw new Error("Missing image path");
        
        const fullPath = path.join(process.cwd(), 'public', sub.rawImagePath);
        const ext = path.extname(fullPath).toLowerCase();
        const pages = await getPagesFromFile(fullPath, ext);
        const pdfChunked = isOversizedPdf(fullPath, ext);
        const fileSizeMb = ext === ".pdf" ? getFileSizeMb(fullPath) : 0;

        const pageTranscripts = await runChunkedParallelOcr(
          sub.id,
          pages,
          (page) => {
            const pageQs = solvedAnswerKey.filter(q => {
              const pNums = q.pageNumbers || (q.pageNumber ? [q.pageNumber] : [1]);
              return pNums.includes(page.pageNumber);
            });
            if (pageQs.length === 0) {
              return `You are an expert Math/Physics transcription assistant.
Attached is Page ${page.pageNumber}. Transcribe any handwritten text or formulas. If empty, output "No student work".`;
            }
            const masterQuestionsList = pageQs.map(q => `${q.questionNumber} (${q.type})`).join(", ");
            if (assignment.gradingDepth === "Fast" || assignment.evaluationType === "Homework") {
              return `You are an expert transcription assistant.
Attached is Page ${page.pageNumber}. The questions on this page are: [${masterQuestionsList}].
Your SOLE job is to transcribe the student's FINAL CHOSEN ANSWER or FINAL OPTION LETTER for each of these questions.
DO NOT transcribe intermediate derivation steps or working process. Just give the final answer.
For each question, output:
### Question [questionNumber]
Student's final answer: [final chosen option or numerical answer]
Wrap math in LaTeX ($ ... $ or $$ ... $$).`;
            }
            return `You are an expert transcription assistant.
Attached is Page ${page.pageNumber}. The questions on this page are: [${masterQuestionsList}].
Your SOLE job is to transcribe the student's handwritten answer and full working steps for each question.
For each question, output:
### Question [questionNumber]
Student's handwritten answer/work: [handwritten steps and final chosen answer]
DO NOT transcribe the question texts. Wrap math in LaTeX.`;
          },
          `BatchEngine: Targeted OCR (${sub.id})`,
          pdfChunked,
          fileSizeMb,
          getOrTranscribePage
        );
        ocrResults.push({
          id: sub.id,
          markdown: pageTranscripts.join("\n\n"),
          rawImagePath: sub.rawImagePath
        });
      } catch (err: any) {
        console.error(`[BatchGradingEngine] OCR failed for ${sub.id}:`, err);
        // Mark as error
        await prisma.submission.update({
          where: { id: sub.id },
          data: { status: 'Error during OCR', needsReview: true, errorMessage: String(err).slice(0,200) }
        });
      }
    })
  );

  if (ocrResults.length === 0) {
    return [{ success: false, error: "All submissions failed OCR in this batch." }];
  }

  // 4. Multi-Student Reasoning Prompt
  console.log(`[BatchGradingEngine] Generating reasoning for ${ocrResults.length} students in one call...`);
  
  let studentsDataStr = "";
  for (const res of ocrResults) {
    studentsDataStr += `<Student id="${res.id}">\n${res.markdown}\n</Student>\n\n`;
  }

  const subjectPrompt = assignment.subject === "AP Physics" 
    ? "Pay special attention to free-body diagrams, vector directions (signs), units (e.g. N, m/s^2), and kinematic equations."
    : "Pay special attention to limits, derivatives, integrals, algebraic signs (+ vs -), and proper mathematical notation.";

  let modePrompt = "";
  if (assignment.aiMode === "AnswerKey" || assignment.gradingDepth === "Fast") {
    modePrompt = `CRITICAL MODE INSTRUCTION: You MUST grade each student's work STRICTLY by comparing it to the provided [ANSWER KEY]. Do not use your own derived answers.
       This is a FAST / HOMEWORK evaluation: Skip detailed steps or derivation checking. Focus strictly on comparing the student's final chosen answer/option to the standard correct answer. If the final answer matches, it is correct (status: 'correct'). If not, it is wrong (status: 'error') and award 0 points. Do not award partial credit or step points. Keep standardSteps and gradingLogic extremely brief.`;
  } else {
    modePrompt = `CRITICAL MODE INSTRUCTION: Use your advanced mathematical reasoning to deduce the correct steps and evaluate each student's work logically against the [ANSWER KEY].
       This is a REASONING / EXAM evaluation: Meticulously evaluate the student's step-by-step derivations. Apply Error Carried Forward (ECF) and award partial credit strictly based on the steps.`;
  }

  const deepSeekSystemPrompt = `
    You are an elite ${assignment.subject} grading assistant processing a BATCH of multiple students simultaneously.
    ${subjectPrompt}
    ${modePrompt}
    
    Here is the cached master Answer Key containing standard correct answers and steps:
    ${JSON.stringify(solvedAnswerKey, null, 2)}
    
    Here are the transcribed works for multiple students. Each student's work is wrapped in <Student id="[UUID]">...</Student> tags:
    ${studentsDataStr}
    
    Your task is to grade ALL of the provided students.
    
    CRITICAL JSON FORMATTING RULES:
    1. DO NOT include any LaTeX backslashes (\\), mathematical formatting, or formulas inside the "gradingLogic", "pointsAwarded" or "status" fields. Use plain text characters only.
    2. Double-escape any necessary JSON quotes or characters inside strings.
    
    You MUST output a valid JSON object matching EXACTLY this schema (and nothing else):
    {
      "results": {
        "[Student ID]": {
          "pipeline": [
            {
              "questionNumber": "String (e.g. '1', '2a')",
              "type": "String ('MCQ' or 'FRQ')",
              "ocrQuestionText": "String (The question text itself from the master Answer Key)",
              "ocrStudentWork": "String (The student's steps/answer)",
              "gradingLogic": "String (Your detailed grading explanation, EXTREMELY CONCISE, under 15 words)",
              "status": "String ('correct', 'error', or 'ecf')",
              "pointsAwarded": "String"
            }
          ],
          "totalScore": Integer (0 to 100 representing the overall percentage correctness)
        },
        "[Another Student ID]": {
           // same structure
        }
      }
    }
  `;

  let dsResultRaw = "";
  try {
    const dsStartTime = Date.now();
    dsResultRaw = (await generateReasoning(deepSeekSystemPrompt, "Process this batch of students.", true, "deepseek-v4-flash", false)) || "";
    console.log(`[BatchGradingEngine] Batch Reasoning complete in ${((Date.now() - dsStartTime) / 1000).toFixed(1)}s`);

    let cleanJson = dsResultRaw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    cleanJson = cleanJson.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
    }
    
    const aiResult = JSON.parse(cleanJson);
    const resultsMap = aiResult.results || {};

    // 5. Save results
    for (const res of ocrResults) {
      const studentResult = resultsMap[res.id];
      if (!studentResult) {
        console.error(`[BatchGradingEngine] LLM omitted results for student ${res.id}`);
        await prisma.submission.update({
          where: { id: res.id },
          data: { status: 'Error', needsReview: true, errorMessage: 'LLM omitted this student in batch output' }
        });
        continue;
      }

      await prisma.slice.create({
        data: {
          submissionId: res.id,
          questionName: 'Processed Batch Homework',
          rawImagePath: res.rawImagePath,
          ocrText: res.markdown,
          reasoningTree: JSON.stringify(studentResult.pipeline),
          aiScore: studentResult.totalScore,
          finalScore: studentResult.totalScore
        }
      });

      await prisma.submission.update({
        where: { id: res.id },
        data: { 
          status: studentResult.totalScore < 60 ? 'Needs Review' : 'Graded', 
          needsReview: studentResult.totalScore < 60,
          totalScore: studentResult.totalScore,
          processingMeta: null,
        }
      });
      console.log(`[BatchGradingEngine] Saved results for student ${res.id}`);
    }
    
    return [{ success: true }];

  } catch (error: any) {
    console.error('[BatchGradingEngine] Reasoning Phase Failed:', error);
    let msg = error?.message || String(error);
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota")) {
      msg = "API Quota Exceeded during Batch Reasoning.";
    } else if (msg.length > 500) {
      msg = msg.substring(0, 500) + "...";
    }

    // Mark all remaining in batch as error
    for (const res of ocrResults) {
      await prisma.submission.update({
        where: { id: res.id },
        data: { status: 'Error', needsReview: true, errorMessage: msg }
      });
    }
    
    return [{ success: false, error: msg }];
  }
}
