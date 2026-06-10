import { Type } from "@google/genai";
import { generateContentWithFallback } from "./aiClient";
import {
  isOversizedBuffer,
  splitPdfBufferIntoPageRanges,
  getParallelWorkerCount,
  PDF_LLM_MAX_BYTES,
} from "./pdfChunking";

const BATCH_ANALYZE_SCHEMA = {
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
          endPage: { type: Type.INTEGER },
        },
        required: ["studentId", "studentName", "startPage", "endPage"],
      },
    },
    unmatched: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          startPage: { type: Type.INTEGER },
          endPage: { type: Type.INTEGER },
        },
        required: ["startPage", "endPage"],
      },
    },
  },
  required: ["matched", "unmatched"],
};

function buildAnalyzePrompt(studentListString: string, pageHint: string): string {
  return `
    Attached is a multi-page PDF containing handwritten assignments from an entire class of students.
    ${pageHint}
    The students officially enrolled in this class are: [${studentListString}].
    
    Your task is to analyze the document and determine the page boundaries for EACH student's assignment.
    Students typically write their name on the first page of their submission.
    
    Instructions:
    1. Identify the start and end pages (1-indexed) for each distinct homework submission.
    2. Match the name written on the submission to one of the officially enrolled students.
    3. If a submission's name is completely illegible or does not match any enrolled student, mark the studentName as "Unknown" and leave the studentId empty.
    
    Return a JSON object containing two arrays: 'matched' and 'unmatched'.
  `;
}

function parseAnalyzeResponse(resultText: string): { matched: any[]; unmatched: any[] } {
  let cleanJson = resultText.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleanJson = cleanJson.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  const firstBrace = cleanJson.indexOf("{");
  const lastBrace = cleanJson.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
  }
  const aiResult = JSON.parse(cleanJson);
  return {
    matched: aiResult.matched || [],
    unmatched: aiResult.unmatched || [],
  };
}

async function analyzePdfChunk(
  chunkBuffer: Buffer,
  studentListString: string,
  pageHint: string,
  contextStr: string
): Promise<{ matched: any[]; unmatched: any[] }> {
  const prompt = buildAnalyzePrompt(studentListString, pageHint);
  const parts = [
    {
      inlineData: {
        data: chunkBuffer.toString("base64"),
        mimeType: "application/pdf",
      },
    },
    { text: prompt },
  ];

  const response = await generateContentWithFallback(parts, BATCH_ANALYZE_SCHEMA, contextStr);
  const resultText = response?.text;
  if (!resultText) throw new Error("Empty response from Gemini API");
  return parseAnalyzeResponse(resultText);
}

export type BatchAnalyzeResult = {
  matched: { studentId: string; studentName: string; startPage: number; endPage: number }[];
  unmatched: { startPage: number; endPage: number }[];
  pdfChunked: boolean;
  totalChunks: number;
  fileSizeMb: number;
  message: string;
};

export async function analyzeBatchPdf(
  buffer: Buffer,
  studentListString: string
): Promise<BatchAnalyzeResult> {
  const fileSizeMb = buffer.length / (1024 * 1024);

  if (!isOversizedBuffer(buffer)) {
    const result = await analyzePdfChunk(
      buffer,
      studentListString,
      "This PDF contains the full class batch.",
      "BatchAnalyze"
    );
    return {
      matched: result.matched,
      unmatched: result.unmatched,
      pdfChunked: false,
      totalChunks: 1,
      fileSizeMb,
      message: "",
    };
  }

  const chunks = await splitPdfBufferIntoPageRanges(buffer, PDF_LLM_MAX_BYTES);
  const parallelWorkers = getParallelWorkerCount();
  console.log(
    `[BatchAnalyze] Large PDF (${fileSizeMb.toFixed(1)} MB) split into ${chunks.length} chunks. Running ${parallelWorkers} parallel analyzers...`
  );

  const queue = [...chunks];
  const partialResults: { matched: any[]; unmatched: any[]; pageOffset: number }[] = [];

  const workers = Array.from({ length: Math.min(parallelWorkers, queue.length) }, async () => {
    while (queue.length > 0) {
      const chunk = queue.shift();
      if (!chunk) break;

      const pageHint = `This PDF chunk covers original pages ${chunk.startPage} to ${chunk.endPage}. Report page numbers relative to THIS chunk (starting at 1).`;
      const result = await analyzePdfChunk(
        chunk.buffer,
        studentListString,
        pageHint,
        `BatchAnalyze Chunk ${chunk.startPage}-${chunk.endPage}`
      );

      partialResults.push({
        matched: result.matched.map((m: any) => ({
          ...m,
          startPage: (m.startPage || 1) + chunk.pageOffset,
          endPage: (m.endPage || 1) + chunk.pageOffset,
        })),
        unmatched: result.unmatched.map((u: any) => ({
          startPage: (u.startPage || 1) + chunk.pageOffset,
          endPage: (u.endPage || 1) + chunk.pageOffset,
        })),
        pageOffset: chunk.pageOffset,
      });
    }
  });

  await Promise.all(workers);

  const matched = partialResults.flatMap((r) => r.matched);
  const unmatched = partialResults.flatMap((r) => r.unmatched);

  return {
    matched,
    unmatched,
    pdfChunked: true,
    totalChunks: chunks.length,
    fileSizeMb,
    message: `Large PDF (${fileSizeMb.toFixed(1)} MB) exceeded 10 MB limit. Split into ${chunks.length} page-range chunks and analyzed in parallel.`,
  };
}
