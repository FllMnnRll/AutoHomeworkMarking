import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { processHomeworkSlice } from "@/lib/gradingEngine";
import { processBatchHomework } from "@/lib/batchGradingEngine";

const prisma = new PrismaClient();

/**
 * Resolve the per-request batch size from the GRADING_CONCURRENCY env var.
 * - Default = 1
 * - Non-numeric, NaN, or non-positive values fall back to 1
 *
 * NOTE: this is the maximum number of Queued submissions that a single
 * /process-next POST will claim and process in parallel. It is intentionally
 * small to stay well under external rate limits (e.g. 1 concurrent
 * Gemini call + 1 DB write per request).
 */
function getConcurrencyLimit(): number {
  const raw = process.env.GRADING_CONCURRENCY;
  const parsed = parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20; // Default to 20 queue items per pull to allow for batching
  }
  return parsed;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Reset stuck tasks (Processing OCR for more than 15 minutes) — logic unchanged.
    //    If a previous /process-next call crashed mid-flight, the submission would
    //    otherwise stay locked in 'Processing OCR' forever.
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
    await prisma.submission.updateMany({
      where: {
        status: "Processing OCR",
        updatedAt: { lt: fifteenMinutesAgo },
      },
      data: { status: "Queued" },
    });

    const CONCURRENCY_LIMIT = getConcurrencyLimit();
    console.log(`[Process-Next] Batch size: ${CONCURRENCY_LIMIT}`);

    // 2. Pull up to N oldest Queued submissions.
    //    Single SELECT — sorted by createdAt so the queue is FIFO.
    const queued = await prisma.submission.findMany({
      where: { status: "Queued" },
      orderBy: { createdAt: "asc" },
      take: CONCURRENCY_LIMIT,
    });

    if (queued.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "No queued submissions",
          batchSize: 0,
          results: [],
        },
        { status: 200 }
      );
    }

    // 3. Atomic lock: flip every selected submission to 'Processing OCR' inside
    //    a single $transaction. This is the "claim" step that prevents another
    //    /process-next call (running in parallel) from picking up the same rows.
    //
    //    Caveats (intentionally accepted for this task):
    //      - Two concurrent /process-next calls can both SELECT the same Queued
    //        rows before either reaches this transaction. The transaction itself
    //        is serial, so once one wins, the loser's `update` is a no-op (id
    //        is already in 'Processing OCR') — but the loser has already cached
    //        the row in `queued` and will still process it. This is a known
    //        best-effort guard, not a hard mutex. Out of scope for this task.
    //      - The Submission.errorMessage column is owned by gradingEngine; we
    //        never touch it from this route.
    await prisma.$transaction(
      queued.map((s) =>
        prisma.submission.update({
          where: { id: s.id },
          data: { status: "Processing OCR" },
        })
      )
    );

    // 4. Group by assignment and chunk
    // Group queued submissions by assignmentId
    const grouped = queued.reduce((acc, s) => {
      if (!acc[s.assignmentId]) acc[s.assignmentId] = [];
      acc[s.assignmentId].push(s);
      return acc;
    }, {} as Record<string, typeof queued>);

    type TaskResult = {
      id: string;
      durationMs: number;
      success: boolean;
      errorMessage: string | null;
    };

    const tasks: Promise<TaskResult>[] = [];

    for (const [assignmentId, subs] of Object.entries(grouped)) {
      // Look up assignment to check depth
      const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId } });
      const depth = assignment?.gradingDepth === "Fast" ? 10 : 3;
      
      // Chunk the array
      for (let i = 0; i < subs.length; i += depth) {
        const chunk = subs.slice(i, i + depth);
        const chunkIds = chunk.map(c => c.id);
        
        const start = Date.now();
        tasks.push(
          (async () => {
            try {
              console.log(`[Process-Next] Starting batch task for ${chunkIds.length} submissions`);
              await processBatchHomework(chunkIds);
              return {
                id: chunkIds.join(","),
                durationMs: Date.now() - start,
                success: true,
                errorMessage: null,
              };
            } catch (err: any) {
              const msg = (err?.message ?? String(err)).slice(0, 200);
              console.error(`[Process-Next] Batch failed:`, msg);
              return {
                id: chunkIds.join(","),
                durationMs: Date.now() - start,
                success: false,
                errorMessage: msg,
              };
            }
          })()
        );
      }
    }

    const settled = await Promise.allSettled(tasks);

    // 5. Build the response. `success` at the top level means "the request
    //    itself ran to completion" — NOT "all tasks succeeded". Per-task
    //    success is in the `results` array.
    const response = {
      success: true,
      batchSize: queued.length,
      results: settled.map((r) =>
        r.status === "fulfilled"
          ? r.value
          : {
              // Should be unreachable — each task catches its own errors —
              // but guard so a programmer error in the map above can't
              // 500 the whole response.
              id: "unknown",
              durationMs: 0,
              success: false,
              errorMessage: String(r.reason).slice(0, 200),
            }
      ),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Process Next Error:", error);
    return NextResponse.json(
      { error: "Failed to process next task" },
      { status: 500 }
    );
  }
}
