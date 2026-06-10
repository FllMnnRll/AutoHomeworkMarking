import { PrismaClient } from '@prisma/client';
import { generateContentWithFallback, generateWithDeepSeek } from '../lib/aiClient';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function main() {
  const assignmentId = "ca5c6d27-1b12-4dcb-947b-331a42ddcf9e";
  const subId = "238162ad-ace3-4d4b-91ef-d479c7a3d2b7"; // Ethan

  console.log("=== Testing 75% Targeted Cached Grading Path ===");
  
  // 1. Fetch assignment and its cached solvedAnswerKey
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId }
  });

  if (!assignment || !assignment.solvedAnswerKey) {
    throw new Error("No cached solvedAnswerKey found!");
  }

  const solvedAnswerKey = JSON.parse(assignment.solvedAnswerKey);
  console.log(`Loaded cached answer key with ${solvedAnswerKey.length} questions.`);

  // 2. Fetch submission
  const submission = await prisma.submission.findUnique({
    where: { id: subId }
  });
  if (!submission || !submission.rawImagePath) {
    throw new Error("Submission not found!");
  }

  // 3. Delete Ethan's old slices to allow re-grading
  await prisma.slice.deleteMany({
    where: { submissionId: subId }
  });

  const fullPath = path.join(process.cwd(), 'public', submission.rawImagePath);
  const ext = path.extname(fullPath).toLowerCase();
  const mimeType = ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
  
  const imagePart = {
    inlineData: {
      data: Buffer.from(fs.readFileSync(fullPath)).toString("base64"),
      mimeType
    }
  };

  const parts: any[] = [imagePart];

  console.log("\n[STAGE 1] Running Targeted Gemini OCR (Only transcribing answers)...");
  const geminiStart = Date.now();
  const masterQuestionsList = solvedAnswerKey.map((q: any) => `${q.questionNumber} (${q.type})`).join(", ");
  const ocrPrompt = `
    You are an expert Math/Physics transcription assistant.
    Attached is a student's handwritten homework submission.
    
    We already know the questions in this assignment. They are: [${masterQuestionsList}].
    
    Your SOLE job is to transcribe the student's handwritten answer and work for each of these questions.
    For each question, output in the following format:
    ### Question [questionNumber]
    Student's handwritten answer/work: [handwritten steps and final chosen answer]
    
    DO NOT transcribe the question texts. Just transcribe the student's own work and answer.
    Wrap all math formulas in LaTeX ($ ... $ or $$ ... $$).
  `;
  parts.push({ text: ocrPrompt });

  const geminiResponse = await generateContentWithFallback(parts, null, "TestTargeted: OCR");
  const transcribedMarkdown = geminiResponse?.text || "";
  const geminiTime = ((Date.now() - geminiStart) / 1000).toFixed(1);
  console.log(`Gemini targeted OCR completed in ${geminiTime}s!`);
  console.log("Transcribed content sample length:", transcribedMarkdown.length);

  console.log("\n[STAGE 2] Running deepseek-v4-flash comparative grading...");
  const dsStart = Date.now();
  const deepSeekSystemPrompt = `
    You are an elite ${assignment.subject} grading assistant.
    You are performing ultra-fast cached comparative grading.
    
    Here is the cached master Answer Key containing standard correct answers and steps:
    ${JSON.stringify(solvedAnswerKey, null, 2)}
    
    And here is the student's transcribed work/answers:
    ${transcribedMarkdown}
    
    Grade the student's work step-by-step by comparing it directly to the master Answer Key.
    - Use the master answers and steps as the ground truth.
    - Check if the student's final answer is correct.
    - Evaluate their steps against the master steps.
    - Apply Error Carried Forward (ECF) where appropriate.
    - For MCQ questions, strictly compare their chosen letter against the correct option letter.
    
    You MUST output a valid JSON object matching exactly this schema (and nothing else):
    {
      "pipeline": [
        {
          "questionNumber": "String (e.g. '1', '2a')",
          "type": "String ('MCQ' or 'FRQ')",
          "ocrQuestionText": "String (The question text itself from the master Answer Key)",
          "ocrStudentWork": "String (The student's steps/answer)",
          "gradingLogic": "String (Your detailed step-by-step grading explanation)",
          "status": "String ('correct', 'error', or 'ecf')",
          "pointsAwarded": "String"
        }
      ],
      "totalScore": Integer (0 to 100 representing the overall percentage correctness)
    }
  `;

  const dsResultRaw = await generateWithDeepSeek(deepSeekSystemPrompt, transcribedMarkdown, true, "deepseek-v4-flash", false);
  const dsTime = ((Date.now() - dsStart) / 1000).toFixed(1);
  console.log(`DeepSeek comparative grading completed in ${dsTime}s!`);

  if (!dsResultRaw) throw new Error("Empty DeepSeek response");
  const aiResult = JSON.parse(dsResultRaw);
  console.log(`Grader Score: ${aiResult.totalScore}%`);
  console.log(`Pipeline length: ${aiResult.pipeline.length} items.`);

  console.log("\n=== Total Performance summary (Targeted Path) ===");
  console.log(`Gemini Targeted OCR: ${geminiTime}s`);
  console.log(`DeepSeek Comparison Grading: ${dsTime}s`);
  console.log(`Total duration: ${(Number(geminiTime) + Number(dsTime)).toFixed(1)}s`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
