import fs from "fs";
import { PDFDocument } from "pdf-lib";

/** Maximum raw PDF / LLM inline payload size before page-boundary chunking kicks in. */
export const PDF_LLM_MAX_BYTES = 10 * 1024 * 1024;

export type PageLike = { base64Data: string; mimeType: string; pageNumber: number };

export type ProcessingMeta = {
  pdfChunked: boolean;
  fileSizeMb: number;
  totalPages: number;
  totalChunks: number;
  completedChunks: number;
  processedPages: number;
  parallelWorkers: number;
  phase: "OCR" | "Reasoning" | "Done";
  message: string;
};

export function getBase64ByteSize(base64Data: string): number {
  return Buffer.byteLength(base64Data, "base64");
}

export function getFileSizeBytes(filePath: string): number {
  return fs.statSync(filePath).size;
}

export function getFileSizeMb(filePath: string): number {
  return getFileSizeBytes(filePath) / (1024 * 1024);
}

export function isOversizedPdf(filePath: string, ext: string): boolean {
  if (ext !== ".pdf") return false;
  try {
    return getFileSizeBytes(filePath) > PDF_LLM_MAX_BYTES;
  } catch {
    return false;
  }
}

export function isOversizedBuffer(buffer: Buffer): boolean {
  return buffer.length > PDF_LLM_MAX_BYTES;
}

/**
 * Split rasterized pages into consecutive chunks where each chunk's
 * combined base64 payload stays under maxBytes (page-boundary truncation).
 */
export function splitPagesIntoChunks<T extends PageLike>(
  pages: T[],
  maxBytes: number = PDF_LLM_MAX_BYTES
): T[][] {
  if (pages.length === 0) return [];

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 0;

  for (const page of pages) {
    const pageBytes = getBase64ByteSize(page.base64Data);
    if (current.length > 0 && currentBytes + pageBytes > maxBytes) {
      chunks.push(current);
      current = [page];
      currentBytes = pageBytes;
    } else {
      current.push(page);
      currentBytes += pageBytes;
    }
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Split markdown transcription by ## Page N headers for parallel reasoning.
 */
export function splitMarkdownByPages(markdown: string): { pageNumber: number; content: string }[] {
  const sections: { pageNumber: number; content: string }[] = [];
  const regex = /^## Page (\d+)/gm;
  const matches = [...markdown.matchAll(regex)];

  if (matches.length === 0) {
    return [{ pageNumber: 1, content: markdown }];
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const pageNumber = parseInt(match[1], 10);
    const start = match.index ?? 0;
    const end = i + 1 < matches.length ? (matches[i + 1].index ?? markdown.length) : markdown.length;
    sections.push({ pageNumber, content: markdown.slice(start, end).trim() });
  }

  return sections;
}

export function groupMarkdownSectionsIntoChunks(
  sections: { pageNumber: number; content: string }[],
  maxBytes: number = PDF_LLM_MAX_BYTES
): { startPage: number; endPage: number; markdown: string }[] {
  const chunks: { startPage: number; endPage: number; markdown: string }[] = [];
  let currentSections: typeof sections = [];
  let currentBytes = 0;

  for (const section of sections) {
    const sectionBytes = Buffer.byteLength(section.content, "utf8");
    if (currentSections.length > 0 && currentBytes + sectionBytes > maxBytes) {
      chunks.push({
        startPage: currentSections[0].pageNumber,
        endPage: currentSections[currentSections.length - 1].pageNumber,
        markdown: currentSections.map((s) => s.content).join("\n\n"),
      });
      currentSections = [section];
      currentBytes = sectionBytes;
    } else {
      currentSections.push(section);
      currentBytes += sectionBytes;
    }
  }

  if (currentSections.length > 0) {
    chunks.push({
      startPage: currentSections[0].pageNumber,
      endPage: currentSections[currentSections.length - 1].pageNumber,
      markdown: currentSections.map((s) => s.content).join("\n\n"),
    });
  }

  return chunks;
}

export type PdfPageRangeChunk = {
  buffer: Buffer;
  startPage: number;
  endPage: number;
  pageOffset: number;
};

/**
 * Split a raw PDF buffer into page-range sub-PDFs, each under maxBytes.
 * Used when the entire PDF must be sent to a vision model (batch-analyze).
 */
export async function splitPdfBufferIntoPageRanges(
  fileBuffer: Buffer,
  maxBytes: number = PDF_LLM_MAX_BYTES
): Promise<PdfPageRangeChunk[]> {
  const srcDoc = await PDFDocument.load(fileBuffer);
  const totalPages = srcDoc.getPageCount();

  if (fileBuffer.length <= maxBytes) {
    return [{ buffer: fileBuffer, startPage: 1, endPage: totalPages, pageOffset: 0 }];
  }

  const avgBytesPerPage = Math.max(1, Math.ceil(fileBuffer.length / totalPages));
  const pagesPerChunk = Math.max(1, Math.floor(maxBytes / avgBytesPerPage));

  const chunks: PdfPageRangeChunk[] = [];
  for (let start = 0; start < totalPages; start += pagesPerChunk) {
    const end = Math.min(start + pagesPerChunk, totalPages);
    const newDoc = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copied = await newDoc.copyPages(srcDoc, pageIndices);
    copied.forEach((p) => newDoc.addPage(p));
    const chunkBuffer = Buffer.from(await newDoc.save());
    chunks.push({
      buffer: chunkBuffer,
      startPage: start + 1,
      endPage: end,
      pageOffset: start,
    });
  }

  return chunks;
}

export function buildProcessingMeta(
  partial: Partial<ProcessingMeta> & Pick<ProcessingMeta, "pdfChunked" | "fileSizeMb" | "totalPages">
): ProcessingMeta {
  return {
    pdfChunked: partial.pdfChunked,
    fileSizeMb: partial.fileSizeMb,
    totalPages: partial.totalPages,
    totalChunks: partial.totalChunks ?? 1,
    completedChunks: partial.completedChunks ?? 0,
    processedPages: partial.processedPages ?? 0,
    parallelWorkers: partial.parallelWorkers ?? 1,
    phase: partial.phase ?? "OCR",
    message: partial.message ?? "",
  };
}

export function serializeProcessingMeta(meta: ProcessingMeta): string {
  return JSON.stringify(meta);
}

export function parseProcessingMeta(raw: string | null | undefined): ProcessingMeta | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ProcessingMeta;
  } catch {
    return null;
  }
}

/** Resolve how many parallel workers to use (same model, multiple concurrent calls). */
export function getParallelWorkerCount(): number {
  const raw = process.env.PDF_CHUNK_PARALLEL_WORKERS;
  const parsed = parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 3;
  return Math.min(parsed, 8);
}
