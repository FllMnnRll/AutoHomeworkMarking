import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { generateContentWithFallback, generateReasoning } from './aiClient';
import { PDFDocument } from 'pdf-lib';
import crypto from 'crypto';

const prisma = new PrismaClient();

/**
 * Gets or transcribes a page's visual content using a hash of the image data & prompt.
 * If there is a cache hit, skips the Gemini API call entirely.
 */
export async function getOrTranscribePage(
  base64Data: string, 
  mimeType: string, 
  prompt: string, 
  contextStr: string
): Promise<string> {
  const rawString = base64Data + "|" + prompt;
  const hash = crypto.createHash('md5').update(rawString).digest('hex');

  try {
    const cached = await prisma.ocrCache.findUnique({
      where: { hash }
    });
    if (cached) {
      console.log(`[GradingEngine Cache] Cache HIT for ${contextStr} (MD5: ${hash}). Skipping Gemini API call.`);
      return cached.text;
    }
  } catch (dbErr) {
    console.warn(`[GradingEngine Cache] Failed to read from ocrCache:`, dbErr);
  }

  // Cache miss
  if (process.env.USE_MOCK_OCR === "true") {
    console.log(`[GradingEngine MOCK] Simulating OCR extraction for ${contextStr} to save Gemini quota...`);
    const mockText = "## Mocked Page Data\n\nStudent solved it as follows:\nQuestion 1: $$ x = 42 $$\nQuestion 2: Option B\n(This is a mock transcription generated to bypass Gemini OCR).";
    
    // Save to cache so subsequent runs hit cache
    try {
      await prisma.ocrCache.create({ data: { hash, text: mockText } });
    } catch(e) {}
    
    return mockText;
  }

  const response = await generateContentWithFallback(
    [
      {
        inlineData: {
          data: base64Data,
          mimeType: mimeType
        }
      },
      { text: prompt }
    ],
    null,
    contextStr
  );

  const transcribedText = response?.text || "";

  try {
    await prisma.ocrCache.create({
      data: { hash, text: transcribedText }
    });
    console.log(`[GradingEngine Cache] Cache SAVED for ${contextStr} (MD5: ${hash}).`);
  } catch (dbErr) {
    console.warn(`[GradingEngine Cache] Failed to save to ocrCache:`, dbErr);
  }

  return transcribedText;
}

/**
 * Splits a file into individual pages.
 * If PDF: returns an array of base64 strings representing JPEG images of each page.
 * If Image: returns an array containing the single image's base64 string.
 */
export async function getPagesFromFile(filePath: string, ext: string): Promise<{ base64Data: string; mimeType: string; pageNumber: number }[]> {
  const fileBuffer = fs.readFileSync(filePath);
  
  if (ext === '.pdf') {
    try {
      console.log(`[GradingEngine] Rasterizing PDF to images using pdfjs-dist...`);
      const { createCanvas } = eval('require("canvas")');
      const pdfjsLib = eval('require("pdfjs-dist/legacy/build/pdf.js")');

      const data = new Uint8Array(fileBuffer);
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdfDoc = await loadingTask.promise;
      const pageCount = pdfDoc.numPages;
      console.log(`[GradingEngine] Loaded PDF with ${pageCount} pages. Rendering to JPEG...`);
      
      const pages: { base64Data: string; mimeType: string; pageNumber: number }[] = [];
      
      // Tunable: PDF rasterization scale. Lower = smaller payload to Gemini, faster.
      // Default 2.0. Range [0.5, 3.0]. Override via env PDF_RASTER_SCALE.
      const parsedScale = parseFloat(process.env.PDF_RASTER_SCALE as string);
      const pdfRasterScale = Number.isFinite(parsedScale)
        ? Math.min(3.0, Math.max(0.5, parsedScale))
        : 2.0;
      console.log(`[GradingEngine] PDF raster scale = ${pdfRasterScale} (env PDF_RASTER_SCALE=${process.env.PDF_RASTER_SCALE ?? "unset"}, default 2.0)`);

      for (let i = 1; i <= pageCount; i++) {
        const page = await pdfDoc.getPage(i);
        // Render at the configured scale (default 2.0) to balance OCR quality vs payload size.
        const viewport = page.getViewport({ scale: pdfRasterScale });

        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext('2d');

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
        
        // Save as JPEG to base64
        const jpegBuffer = canvas.toBuffer('image/jpeg', { quality: 0.95 });
        pages.push({
          base64Data: jpegBuffer.toString('base64'),
          mimeType: 'image/jpeg',
          pageNumber: i
        });
      }
      return pages;
    } catch (err) {
      console.error("[GradingEngine] Failed to rasterize PDF using canvas/pdfjs, falling back to treating whole file as single page:", err);
    }
  }
  
  // Default fallback for images or failed PDF split: treat whole file as single page
  let mimeType = ext === '.pdf' ? 'application/pdf' : 'image/jpeg';
  return [{
    base64Data: fileBuffer.toString('base64'),
    mimeType,
    pageNumber: 1
  }];
}

/**
 * Processes a homework slice using a 2-Stage Pipeline:
 * Stage 1: Gemini (Vision OCR -> Markdown)
 * Stage 2: DeepSeek (Reasoning -> JSON)
 */
export async function processHomeworkSlice(submissionId: string, imagePath: string) {
  try {
    // 1. Update submission status
    const submission = await prisma.submission.update({
      where: { id: submissionId },
      data: { status: 'Processing OCR' },
      include: { assignment: true }
    });

    const assignment = submission.assignment;

    // 2. Read local image or PDF file
    const fullPath = path.join(process.cwd(), 'public', imagePath);
    const ext = path.extname(fullPath).toLowerCase();
    
    // Get all individual pages
    const pages = await getPagesFromFile(fullPath, ext);

    // ==========================================
    // CACHING ARCHITECTURE SETUP
    // ==========================================
    const solvedKeyStr = assignment.solvedAnswerKey;
    let solvedAnswerKey: any[] = [];
    if (solvedKeyStr) {
      try {
        solvedAnswerKey = JSON.parse(solvedKeyStr);
      } catch (e) {
        console.warn("[GradingEngine] Failed to parse cached solvedAnswerKey:", e);
      }
    }

    const hasCachedKey = solvedAnswerKey && solvedAnswerKey.length > 0;

    let transcribedMarkdown = "";
    let isCrossValidation = false;
    let isTargetedOcr = false;

    // ==========================================
    // STAGE 1: VISUAL EXTRACTION (GEMINI)
    // ==========================================
    if (!hasCachedKey) {
      console.log(`[GradingEngine] Phase A: No cached key. Running Full Parallel OCR on ${pages.length} pages & Generating Master Answer Key...`);
      
      const geminiStartTime = Date.now();
      const pageTranscripts = await Promise.all(
        pages.map(async (page) => {
          const prompt = `You are an expert Math/Physics transcription assistant.
This is Page ${page.pageNumber} of a student's handwritten homework submission.
Your SOLE job is to transcribe EVERYTHING you see on this page into clean, structured Markdown.
- Transcribe all text, numbers, formulas, and diagrams exactly as written.
- Wrap ALL math in LaTeX block ($$ ... $$) or inline ($ ... $).
- DO NOT solve the problems. DO NOT grade the problems. Just TRANSCRIBE.`;
          const text = await getOrTranscribePage(
            page.base64Data,
            page.mimeType,
            prompt,
            `GradingEngine: Phase A Full OCR Page ${page.pageNumber}`
          );
          return `## Page ${page.pageNumber}\n\n${text}`;
        })
      );
      transcribedMarkdown = pageTranscripts.join("\n\n");

      // If AnswerKey mode is selected, attach and transcribe the answer key file
      if (assignment.aiMode === "AnswerKey" && assignment.answerKeyPath) {
        const akFullPath = path.join(process.cwd(), 'public', assignment.answerKeyPath);
        if (fs.existsSync(akFullPath)) {
          console.log("[GradingEngine] Transcribing Answer Key...");
          const akExt = path.extname(akFullPath).toLowerCase();
          const akPages = await getPagesFromFile(akFullPath, akExt);
          const akTranscripts = await Promise.all(
            akPages.map(async (akPage) => {
              const isHomework = assignment.evaluationType === "Homework";
              const prompt = isHomework
                ? `You are an expert Math/Physics transcription assistant.
This is Page ${akPage.pageNumber} of the Answer Key.
Your SOLE job is to transcribe ONLY the correct question numbers and their final correct answers (e.g. option letters like 'A', 'B', or short final values like 'x = 5').
DO NOT transcribe verbose step-by-step solutions, explanations, derivations, or long descriptions. 
Skip all detailed solving steps entirely to make it extremely compact.`
                : `You are an expert Math/Physics transcription assistant.
This is Page ${akPage.pageNumber} of the Answer Key.
Your SOLE job is to transcribe EVERYTHING you see on this page into clean, structured Markdown.
Wrap ALL math in LaTeX block ($$ ... $$) or inline ($ ... $).
DO NOT solve the problems. Just TRANSCRIBE.`;
              const text = await getOrTranscribePage(
                akPage.base64Data,
                akPage.mimeType,
                prompt,
                `GradingEngine: Answer Key OCR Page ${akPage.pageNumber}`
              );
              return `### Answer Key Page ${akPage.pageNumber}\n\n${text}`;
            })
          );
          transcribedMarkdown += `\n\n# ANSWER KEY\n\n${akTranscripts.join("\n\n")}`;
        }
      }
      
      console.log(`[GradingEngine] Full Parallel OCR complete in ${((Date.now() - geminiStartTime) / 1000).toFixed(1)}s`);
    } else {
      // Tunable: Cross-Validation vs Targeted OCR probability.
      // Default 0.25. Range [0, 1]. Override via env CROSS_VAL_PROB.
      const parsedProb = parseFloat(process.env.CROSS_VAL_PROB as string);
      const crossValProb = Number.isFinite(parsedProb)
        ? Math.min(1.0, Math.max(0.0, parsedProb))
        : 0.25;
      isCrossValidation = Math.random() < crossValProb;
      const branchLabel = isCrossValidation ? "Cross-Validation OCR" : "Targeted OCR";
      console.log(`[GradingEngine] Phase B: Cache hit. Branch = ${branchLabel} (CROSS_VAL_PROB=${crossValProb}, env=${process.env.CROSS_VAL_PROB ?? "unset"}, default 0.25).`);

      if (isCrossValidation) {
        console.log(`[GradingEngine] Phase B: Cache hit. Running Cross-Validation check (Full Parallel OCR)...`);
        
        const geminiStartTime = Date.now();
        const pageTranscripts = await Promise.all(
          pages.map(async (page) => {
            const prompt = `You are an expert Math/Physics transcription assistant.
This is Page ${page.pageNumber} of a student's handwritten homework submission.
Your SOLE job is to transcribe EVERYTHING you see on this page into clean, structured Markdown.
- Transcribe all text, numbers, formulas, and diagrams exactly as written.
- Wrap ALL math in LaTeX block ($$ ... $$) or inline ($ ... $).
- DO NOT solve the problems. DO NOT grade the problems. Just TRANSCRIBE.`;
            const text = await getOrTranscribePage(
              page.base64Data,
              page.mimeType,
              prompt,
              `GradingEngine: Cross-Val OCR Page ${page.pageNumber}`
            );
            return `## Page ${page.pageNumber}\n\n${text}`;
          })
        );
        transcribedMarkdown = pageTranscripts.join("\n\n");
        console.log(`[GradingEngine] Cross-Val OCR complete in ${((Date.now() - geminiStartTime) / 1000).toFixed(1)}s`);
      } else {
        console.log(`[GradingEngine] Phase B: Cache hit. Running Targeted Parallel OCR...`);
        isTargetedOcr = true;

        const geminiStartTime = Date.now();
        const pageTranscripts = await Promise.all(
          pages.map(async (page) => {
            const pageQs = solvedAnswerKey.filter(q => {
              const pNums = q.pageNumbers || (q.pageNumber ? [q.pageNumber] : [1]);
              return pNums.includes(page.pageNumber);
            });
            
            let ocrPrompt = "";
            if (pageQs.length === 0) {
              ocrPrompt = `You are an expert Math/Physics transcription assistant.
Attached is Page ${page.pageNumber} of a student's handwritten homework submission.
Your job is to transcribe any handwritten text or formulas you see on this page.
If there are no answers or homework content, output: "No student work on this page".`;
            } else {
              const masterQuestionsList = pageQs.map(q => `${q.questionNumber} (${q.type})`).join(", ");
              
              if (assignment.gradingDepth === "Fast" || assignment.evaluationType === "Homework") {
                ocrPrompt = `You are an expert Math/Physics transcription assistant.
Attached is Page ${page.pageNumber} of a student's handwritten homework submission.

We already know the questions on this page are: [${masterQuestionsList}].

Your SOLE job is to transcribe the student's FINAL CHOSEN ANSWER or FINAL OPTION LETTER for each of these questions.
For each question, output in the following format:
### Question [questionNumber]
Student's final answer: [final chosen option or numerical answer]

DO NOT transcribe the question texts. DO NOT transcribe their intermediate derivation steps or working process. Just give the final answer.
Wrap all math formulas in LaTeX ($ ... $ or $$ ... $$).`;
              } else {
                ocrPrompt = `You are an expert Math/Physics transcription assistant.
Attached is Page ${page.pageNumber} of a student's handwritten homework submission.

We already know the questions on this page are: [${masterQuestionsList}].

Your SOLE job is to transcribe the student's handwritten answer and full working steps for each of these questions.
For each question, output in the following format:
### Question [questionNumber]
Student's handwritten answer/work: [handwritten steps and final chosen answer]

DO NOT transcribe the question texts. Just transcribe the student's own work and answer.
Wrap all math formulas in LaTeX ($ ... $ or $$ ... $$).`;
              }
            }

            const text = await getOrTranscribePage(
              page.base64Data,
              page.mimeType,
              ocrPrompt,
              `GradingEngine: Targeted OCR Page ${page.pageNumber}`
            );

            return `## Page ${page.pageNumber}\n\n${text}`;
          })
        );
        transcribedMarkdown = pageTranscripts.join("\n\n");
        console.log(`[GradingEngine] Targeted Parallel OCR complete in ${((Date.now() - geminiStartTime) / 1000).toFixed(1)}s`);
      }
    }

    if (!transcribedMarkdown) throw new Error("Empty OCR transcription from Gemini API");

    // ==========================================
    // STAGE 2: LOGICAL REASONING & GRADING (DEEPSEEK)
    // ==========================================
    console.log(`[GradingEngine] Stage 2: Running Logical Reasoning via DeepSeek...`);

    const subjectPrompt = assignment.subject === "AP Physics" 
      ? "Pay special attention to free-body diagrams, vector directions (signs), units (e.g. N, m/s^2), and kinematic equations."
      : "Pay special attention to limits, derivatives, integrals, algebraic signs (+ vs -), and proper mathematical notation.";

    let modePrompt = "";
    if (assignment.aiMode === "AnswerKey" || assignment.gradingDepth === "Fast") {
      modePrompt = `CRITICAL MODE INSTRUCTION: You MUST grade the student's work STRICTLY by comparing it to the provided [ANSWER KEY] section in the transcription or your generated Master Key. Do not use your own derived answers.
         This is a FAST / HOMEWORK evaluation: Skip detailed steps or derivation checking. Focus strictly on comparing the student's final chosen answer/option to the standard correct answer. If the final answer matches, it is correct (status: 'correct'). If not, it is wrong (status: 'error') and award 0 points. Do not award partial credit or step points. Keep standardSteps and gradingLogic extremely brief.`;
    } else {
      modePrompt = `CRITICAL MODE INSTRUCTION: Use your advanced mathematical reasoning to deduce the correct steps and evaluate the student's work logically against the [ANSWER KEY].
         This is a REASONING / EXAM evaluation: Meticulously evaluate the student's step-by-step derivations, formulas, and working steps. Apply Error Carried Forward (ECF) and award partial credit strictly based on the steps.`;
    }

    let dsResultRaw = "";
    let deepSeekSystemPrompt = "";
    const dsStartTime = Date.now();

    if (!hasCachedKey) {
      // First Submission: Solves & compiles standard answer key using deepseek-v4-flash (no thinking)
      console.log(`[GradingEngine] Running deepseek-v4-flash (no thinking) to compile Master Key...`);
      
      deepSeekSystemPrompt = `
        You are an elite ${assignment.subject} grading assistant.
        ${subjectPrompt}
        ${modePrompt}
        
        You will be provided with a raw Markdown transcription of a student's homework, divided into sections by page headers (e.g. ## Page 1, ## Page 2).
        Your task is to grade it step-by-step.
        
        Since this is the first submission for this assignment, you MUST also compile a Master Answer Key.
        For each question found in the student homework (or answer key), you MUST solve it to get the correct standard steps and standard correct answer.
        You MUST also identify which pages the question is located on (from the ## Page [X] headers). If a question's text or student work spans multiple pages, list all of them.
        
        CRITICAL LATENCY DIRECTIVE: Keep the "gradingLogic" field extremely brief and concise (MUST be under 15 words, e.g. "Solved x = 5 correctly" or "Selected option B, correct").
        
        CRITICAL JSON FORMATTING RULES:
        1. DO NOT include any LaTeX backslashes (\\), mathematical formatting, or formulas inside the "gradingLogic" or "pointsAwarded" or "status" fields. Use plain text characters only.
        2. Double-escape any necessary JSON quotes or characters inside strings.
        
        CRITICAL JSON REQUIREMENT:
        You MUST output a valid JSON object matching exactly this schema (and nothing else):
        {
          "pipeline": [
            {
              "questionNumber": "String (e.g. '1', '2a')",
              "pageNumbers": [Integer] (An array of page indexes where this question was found, 1-indexed, e.g. [1] or [1, 2] if it spans multiple pages),
              "type": "String ('MCQ' or 'FRQ')",
              "ocrQuestionText": "String (The question text itself)",
              "ocrStudentWork": "String (The student's steps/answer)",
              "gradingLogic": "String (Your detailed step-by-step reasoning, EXTREMELY CONCISE, under 15 words)",
              "status": "String ('correct', 'error', or 'ecf')",
              "pointsAwarded": "String",
              "standardAnswer": "String (The correct standard answer, e.g., 'B' or 'x = 5')",
              "standardSteps": "String (The step-by-step derivation/solving steps)"
            }
          ],
          "totalScore": Integer (0 to 100 representing the overall percentage correctness)
        }
        
        All LaTeX backslashes inside strings MUST be double-escaped for JSON (e.g. \\\\frac).
      `;

      dsResultRaw = (await generateReasoning(deepSeekSystemPrompt, transcribedMarkdown, true, "deepseek-v4-flash", false)) || "";
    } else if (isCrossValidation) {
      // Subsequent Cross-Validation path: Grades and cross-checks for new questions via deepseek-v4-flash
      console.log(`[GradingEngine] Running deepseek-v4-flash (no thinking) for cross-validation grading...`);

      deepSeekSystemPrompt = `
        You are an elite ${assignment.subject} grading assistant.
        You are performing comparative grading and cross-validation against a cached Answer Key.
        
        Here is the cached master Answer Key containing standard correct answers and steps:
        ${JSON.stringify(solvedAnswerKey, null, 2)}
        
        And here is the student's full transcribed homework:
        ${transcribedMarkdown}
        
        Your task is two-fold:
        1. Grade the student's work step-by-step against the master Answer Key.
        2. CRITICAL CROSS-VALIDATION: Check if there are any questions in the student's homework that are NOT in the master Answer Key. If you find any new/different questions:
           - Solve them to get the correct standard steps and standard correct answer.
           - Identify which pages they are located on.
           - Grade the student's work for those questions as well.
           - Output these new solved questions in a special "newQuestions" array in your JSON response.
        
        CRITICAL LATENCY DIRECTIVE: Keep the "gradingLogic" field extremely brief and concise (MUST be under 15 words, e.g. "Solved x = 5 correctly" or "Selected option B, correct").
        
        CRITICAL JSON FORMATTING RULES:
        1. DO NOT include any LaTeX backslashes (\\), mathematical formatting, or formulas inside the "gradingLogic" or "pointsAwarded" or "status" fields. Use plain text characters only.
        2. Double-escape any necessary JSON quotes or characters inside strings.
        
        You MUST output a valid JSON object matching exactly this schema (and nothing else):
        {
          "pipeline": [
            {
              "questionNumber": "String (e.g. '1', '2a')",
              "type": "String ('MCQ' or 'FRQ')",
              "ocrQuestionText": "String (The question text)",
              "ocrStudentWork": "String (The student's steps/answer)",
              "gradingLogic": "String (Your detailed step-by-step grading explanation, EXTREMELY CONCISE, under 15 words)",
              "status": "String ('correct', 'error', or 'ecf')",
              "pointsAwarded": "String"
            }
          ],
          "totalScore": Integer (0 to 100),
          "newQuestions": [
            {
              "questionNumber": "String",
              "pageNumbers": [Integer] (An array of page indexes where the question was found, 1-indexed, e.g. [1] or [1, 2]),
              "type": "String",
              "ocrQuestionText": "String",
              "standardAnswer": "String",
              "standardSteps": "String"
            }
          ]
        }
      `;

      dsResultRaw = (await generateReasoning(deepSeekSystemPrompt, transcribedMarkdown, true, "deepseek-v4-flash", false)) || "";
    } else {
      // Subsequent Standard path: Fast comparative grading via deepseek-v4-flash
      console.log(`[GradingEngine] Running ultra-fast deepseek-v4-flash (no thinking) for comparative grading...`);

      deepSeekSystemPrompt = `
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
        
        CRITICAL LATENCY DIRECTIVE: Keep the "gradingLogic" field extremely brief and concise (MUST be under 15 words, e.g. "Solved x = 5 correctly" or "Selected option B, correct").
        
        CRITICAL JSON FORMATTING RULES:
        1. DO NOT include any LaTeX backslashes (\\), mathematical formatting, or formulas inside the "gradingLogic" or "pointsAwarded" or "status" fields. Use plain text characters only.
        2. Double-escape any necessary JSON quotes or characters inside strings.
        
        You MUST output a valid JSON object matching exactly this schema (and nothing else):
        {
          "pipeline": [
            {
              "questionNumber": "String (e.g. '1', '2a')",
              "type": "String ('MCQ' or 'FRQ')",
              "ocrQuestionText": "String (The question text itself from the master Answer Key)",
              "ocrStudentWork": "String (The student's steps/answer)",
              "gradingLogic": "String (Your detailed step-by-step grading explanation, EXTREMELY CONCISE, under 15 words)",
              "status": "String ('correct', 'error', or 'ecf')",
              "pointsAwarded": "String"
            }
          ],
          "totalScore": Integer (0 to 100 representing the overall percentage correctness)
        }
      `;

      dsResultRaw = (await generateReasoning(deepSeekSystemPrompt, transcribedMarkdown, true, "deepseek-v4-flash", false)) || "";
    }

    if (!dsResultRaw) throw new Error("Empty reasoning response from DeepSeek API");
    console.log(`[GradingEngine] DeepSeek complete in ${((Date.now() - dsStartTime) / 1000).toFixed(1)}s`);

    // Clean up reasoning <think> tags and markdown before parsing
    let cleanJson = dsResultRaw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    cleanJson = cleanJson.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
    }
    
    const aiResult = JSON.parse(cleanJson);

    console.log(`[GradingEngine] Pipeline Complete. aiResult keys:`, Object.keys(aiResult));
    console.log(`[GradingEngine] totalScore:`, aiResult.totalScore, `pipeline length:`, aiResult.pipeline?.length);

    // ==========================================
    // SAVE CACHE / RECONCILE
    // ==========================================
    if (!hasCachedKey) {
      console.log(`[GradingEngine] Saving generated Master Answer Key to DB...`);
      const newSolvedKey = aiResult.pipeline.map((item: any) => ({
        questionNumber: item.questionNumber,
        pageNumbers: Array.isArray(item.pageNumbers) ? item.pageNumbers.map(Number) : (item.pageNumber ? [Number(item.pageNumber)] : [1]),
        type: item.type,
        ocrQuestionText: item.ocrQuestionText,
        standardAnswer: item.standardAnswer || "",
        standardSteps: item.standardSteps || ""
      }));

      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { solvedAnswerKey: JSON.stringify(newSolvedKey) }
      });
      console.log(`[GradingEngine] Saved ${newSolvedKey.length} master questions.`);
    } else if (isCrossValidation && aiResult.newQuestions && aiResult.newQuestions.length > 0) {
      console.log(`[GradingEngine] Reconciling ${aiResult.newQuestions.length} new questions into cached Answer Key...`);
      const updatedKey = [...solvedAnswerKey];
      for (const newQ of aiResult.newQuestions) {
        if (!updatedKey.some(q => q.questionNumber === newQ.questionNumber)) {
          updatedKey.push({
            questionNumber: newQ.questionNumber,
            pageNumbers: Array.isArray(newQ.pageNumbers) ? newQ.pageNumbers.map(Number) : (newQ.pageNumber ? [Number(newQ.pageNumber)] : [1]),
            type: newQ.type,
            ocrQuestionText: newQ.ocrQuestionText,
            standardAnswer: newQ.standardAnswer || "",
            standardSteps: newQ.standardSteps || ""
          });
        }
      }
      await prisma.assignment.update({
        where: { id: assignment.id },
        data: { solvedAnswerKey: JSON.stringify(updatedKey) }
      });
      console.log(`[GradingEngine] Reconciled key updated. Total questions now: ${updatedKey.length}`);
    }

    console.log(`[GradingEngine] Creating slice record in database...`);
    try {
      const createdSlice = await prisma.slice.create({
        data: {
          submissionId: submissionId,
          questionName: 'Processed Homework',
          rawImagePath: imagePath,
          ocrText: transcribedMarkdown, // Store the raw Gemini output here!
          reasoningTree: JSON.stringify(aiResult.pipeline),
          aiScore: aiResult.totalScore,
          finalScore: aiResult.totalScore
        }
      });
      console.log(`[GradingEngine] Slice record created successfully:`, createdSlice.id);
    } catch (dbErr) {
      console.error(`[GradingEngine] Failed to create slice record:`, dbErr);
      throw dbErr;
    }

    console.log(`[GradingEngine] Updating submission status to final score...`);
    try {
      const updatedSubmission = await prisma.submission.update({
        where: { id: submissionId },
        data: { 
          status: aiResult.totalScore < 60 ? 'Needs Review' : 'Graded', 
          needsReview: aiResult.totalScore < 60,
          totalScore: aiResult.totalScore
        }
      });
      console.log(`[GradingEngine] Submission status updated successfully. Status:`, updatedSubmission.status);
    } catch (dbErr) {
      console.error(`[GradingEngine] Failed to update submission status:`, dbErr);
      throw dbErr;
    }

    return { success: true, aiResult };

  } catch (error: any) {
    console.error('[GradingEngine] Processing Failed:', error);
    
    // Extract a cleaner error message if it's a large API JSON dump
    let msg = error?.message || String(error);
    if (msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Quota")) {
      msg = "API Quota Exceeded. Please configure multiple API Keys or wait for quota reset.";
    } else if (msg.length > 500) {
      msg = msg.substring(0, 500) + "..."; // Truncate huge dumps
    }

    await prisma.submission.update({
      where: { id: submissionId },
      data: { 
        status: 'Error during OCR', 
        needsReview: true,
        errorMessage: msg
      }
    });
    
    return { success: false, error: msg };
  }
}
