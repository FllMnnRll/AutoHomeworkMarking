import { PrismaClient } from "@prisma/client";
import {
  PageLike,
  ProcessingMeta,
  PDF_LLM_MAX_BYTES,
  splitPagesIntoChunks,
  splitMarkdownByPages,
  groupMarkdownSectionsIntoChunks,
  buildProcessingMeta,
  serializeProcessingMeta,
  getParallelWorkerCount,
  getFileSizeMb,
  isOversizedPdf,
} from "./pdfChunking";
import { generateReasoning } from "./aiClient";

export type TranscribeFn = (
  base64Data: string,
  mimeType: string,
  prompt: string,
  contextStr: string
) => Promise<string>;

const prisma = new PrismaClient();

export async function updateSubmissionMeta(
  submissionId: string,
  meta: ProcessingMeta
): Promise<void> {
  await prisma.submission.update({
    where: { id: submissionId },
    data: { processingMeta: serializeProcessingMeta(meta) },
  });
}

export async function clearSubmissionMeta(submissionId: string): Promise<void> {
  await prisma.submission.update({
    where: { id: submissionId },
    data: { processingMeta: null },
  });
}

type OcrPageJob = {
  page: PageLike;
  prompt: string;
  contextStr: string;
};

/**
 * Run OCR across pages. When pdfChunked=true, processes page-boundary chunks
 * in parallel (multiple same-model calls) and reports progress per chunk.
 */
export async function runChunkedParallelOcr(
  submissionId: string,
  pages: PageLike[],
  buildPrompt: (page: PageLike) => string,
  contextPrefix: string,
  pdfChunked: boolean,
  fileSizeMb: number,
  transcribeFn: TranscribeFn
): Promise<string[]> {
  const pageChunks = pdfChunked ? splitPagesIntoChunks(pages) : [pages];
  const totalChunks = pageChunks.length;
  const parallelWorkers = pdfChunked ? getParallelWorkerCount() : 1;

  if (pdfChunked) {
    await updateSubmissionMeta(
      submissionId,
      buildProcessingMeta({
        pdfChunked: true,
        fileSizeMb,
        totalPages: pages.length,
        totalChunks,
        completedChunks: 0,
        processedPages: 0,
        parallelWorkers,
        phase: "OCR",
        message: `Large PDF (${fileSizeMb.toFixed(1)} MB) split into ${totalChunks} chunks. Running ${parallelWorkers} parallel OCR workers...`,
      })
    );
  }

  const allTranscripts: { pageNumber: number; text: string }[] = [];
  let completedChunks = 0;
  let processedPages = 0;

  // Process page chunks with bounded parallelism across chunks
  const chunkQueue = [...pageChunks];
  const workers = Array.from({ length: Math.min(parallelWorkers, chunkQueue.length) }, async () => {
    while (chunkQueue.length > 0) {
      const chunk = chunkQueue.shift();
      if (!chunk) break;

      const jobs: OcrPageJob[] = chunk.map((page) => ({
        page,
        prompt: buildPrompt(page),
        contextStr: `${contextPrefix} Page ${page.pageNumber}`,
      }));

      const chunkResults = await Promise.all(
        jobs.map(async (job) => {
          const text = await transcribeFn(
            job.page.base64Data,
            job.page.mimeType,
            job.prompt,
            job.contextStr
          );
          return { pageNumber: job.page.pageNumber, text };
        })
      );

      allTranscripts.push(...chunkResults);
      completedChunks++;
      processedPages += chunk.length;

      if (pdfChunked) {
        await updateSubmissionMeta(
          submissionId,
          buildProcessingMeta({
            pdfChunked: true,
            fileSizeMb,
            totalPages: pages.length,
            totalChunks,
            completedChunks,
            processedPages,
            parallelWorkers,
            phase: "OCR",
            message: `OCR chunk ${completedChunks}/${totalChunks} complete (pages up to ${chunk[chunk.length - 1].pageNumber}).`,
          })
        );
      }
    }
  });

  await Promise.all(workers);

  allTranscripts.sort((a, b) => a.pageNumber - b.pageNumber);
  return allTranscripts.map((t) => `## Page ${t.pageNumber}\n\n${t.text}`);
}

type ReasoningChunkResult = {
  pipeline: any[];
  totalScore: number;
  newQuestions?: any[];
};

function mergeReasoningResults(results: ReasoningChunkResult[]): ReasoningChunkResult {
  const pipeline: any[] = [];
  const newQuestions: any[] = [];
  let scoreSum = 0;
  let scoreCount = 0;

  for (const r of results) {
    if (r.pipeline) pipeline.push(...r.pipeline);
    if (r.newQuestions) newQuestions.push(...r.newQuestions);
    if (typeof r.totalScore === "number") {
      scoreSum += r.totalScore;
      scoreCount++;
    }
  }

  const dedupedPipeline = pipeline.filter(
    (item, idx, arr) => arr.findIndex((x) => x.questionNumber === item.questionNumber) === idx
  );
  const dedupedNewQ = newQuestions.filter(
    (item, idx, arr) => arr.findIndex((x) => x.questionNumber === item.questionNumber) === idx
  );

  return {
    pipeline: dedupedPipeline,
    totalScore: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : 0,
    newQuestions: dedupedNewQ.length > 0 ? dedupedNewQ : undefined,
  };
}

function parseReasoningJson(dsResultRaw: string): ReasoningChunkResult {
  let cleanJson = dsResultRaw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  cleanJson = cleanJson.replace(/```(?:json)?/g, "").replace(/```/g, "").trim();
  const firstBrace = cleanJson.indexOf("{");
  const lastBrace = cleanJson.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleanJson = cleanJson.slice(firstBrace, lastBrace + 1);
  }
  const parsed = JSON.parse(cleanJson);
  return {
    pipeline: parsed.pipeline || [],
    totalScore: parsed.totalScore ?? 0,
    newQuestions: parsed.newQuestions,
  };
}

/**
 * Run reasoning, splitting markdown at page boundaries when payload exceeds 10 MB.
 * Each chunk is sent to the same model in parallel; results are merged.
 */
export async function runChunkedParallelReasoning(
  submissionId: string,
  transcribedMarkdown: string,
  buildSystemPrompt: (chunkMarkdown: string, chunkLabel: string) => string,
  pdfChunked: boolean,
  fileSizeMb: number,
  totalPages: number
): Promise<ReasoningChunkResult> {
  const markdownBytes = Buffer.byteLength(transcribedMarkdown, "utf8");
  const needsChunking = markdownBytes > PDF_LLM_MAX_BYTES;

  if (!needsChunking) {
    const dsResultRaw =
      (await generateReasoning(
        buildSystemPrompt(transcribedMarkdown, "full document"),
        transcribedMarkdown,
        true,
        "deepseek-v4-flash",
        false
      )) || "";
    if (!dsResultRaw) throw new Error("Empty reasoning response from DeepSeek API");
    return parseReasoningJson(dsResultRaw);
  }

  const sections = splitMarkdownByPages(transcribedMarkdown);
  const mdChunks = groupMarkdownSectionsIntoChunks(sections);
  const totalChunks = mdChunks.length;
  const parallelWorkers = getParallelWorkerCount();

  await updateSubmissionMeta(
    submissionId,
    buildProcessingMeta({
      pdfChunked: pdfChunked || true,
      fileSizeMb,
      totalPages,
      totalChunks,
      completedChunks: 0,
      processedPages: 0,
      parallelWorkers,
      phase: "Reasoning",
      message: `Transcription exceeds 10 MB. Split into ${totalChunks} reasoning chunks with ${parallelWorkers} parallel workers...`,
    })
  );

  console.log(
    `[ChunkedGrading] Markdown ${(markdownBytes / 1024 / 1024).toFixed(1)} MB → ${totalChunks} reasoning chunks, ${parallelWorkers} workers`
  );

  let completedChunks = 0;
  const chunkResults: ReasoningChunkResult[] = [];

  const queue = [...mdChunks];
  const workers = Array.from({ length: Math.min(parallelWorkers, queue.length) }, async () => {
    while (queue.length > 0) {
      const chunk = queue.shift();
      if (!chunk) break;

      const label = `pages ${chunk.startPage}-${chunk.endPage}`;
      const systemPrompt = buildSystemPrompt(
        chunk.markdown,
        label
      );
      const userPrompt = `Process ONLY the homework content for ${label}.\n\n${chunk.markdown}`;

      const dsResultRaw =
        (await generateReasoning(systemPrompt, userPrompt, true, "deepseek-v4-flash", false)) || "";
      if (!dsResultRaw) throw new Error(`Empty reasoning response for chunk ${label}`);

      chunkResults.push(parseReasoningJson(dsResultRaw));
      completedChunks++;

      await updateSubmissionMeta(
        submissionId,
        buildProcessingMeta({
          pdfChunked: true,
          fileSizeMb,
          totalPages,
          totalChunks,
          completedChunks,
          processedPages: chunk.endPage,
          parallelWorkers,
          phase: "Reasoning",
          message: `Reasoning chunk ${completedChunks}/${totalChunks} complete (${label}).`,
        })
      );
    }
  });

  await Promise.all(workers);
  return mergeReasoningResults(chunkResults);
}

export { isOversizedPdf, getFileSizeMb };
