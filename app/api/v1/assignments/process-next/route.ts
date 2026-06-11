import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { processBatchHomework } from "@/lib/batchGradingEngine";

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

    // 3. Atomic claim: flip each selected submission to 'Processing OCR' only
    //    if it is still 'Queued'. The status guard in the WHERE clause makes
    //    each claim a true compare-and-swap, so two concurrent /process-next
    //    calls can never process the same submission twice (the loser's
    //    updateMany matches 0 rows and the row is dropped from its batch).
    //
    //    Note: the Submission.errorMessage column is owned by gradingEngine;
    //    we never touch it from this route.
    const claimed: typeof queued = [];
    for (const s of queued) {
      const res = await prisma.submission.updateMany({
        where: { id: s.id, status: "Queued" },
        data: { status: "Processing OCR" },
      });
      if (res.count > 0) claimed.push(s);
    }

    if (claimed.length === 0) {
      return NextResponse.json(
        {
          success: true,
          message: "All queued submissions were claimed by another worker",
          batchSize: 0,
          results: [],
        },
        { status: 200 }
      );
    }

    // 4. Group claimed submissions by assignmentId and chunk
    const grouped = claimed.reduce((acc, s) => {
      if (!acc[s.assignmentId]) acc[s.assignmentId] = [];
      acc[s.assignmentId].push(s);
      return acc;
    }, {} as Record<string, typeof queued>);

    // Single query for all involved assignments (instead of one findUnique per group)
    const assignmentIds = Object.keys(grouped);
    const assignments = await prisma.assignment.findMany({
      where: { id: { in: assignmentIds } },
    });
    const assignmentById = new Map(assignments.map((a) => [a.id, a]));

    type TaskResult = {
      id: string;
      durationMs: number;
      success: boolean;
      errorMessage: string | null;
    };

    const tasks: Promise<TaskResult>[] = [];

    for (const [assignmentId, subs] of Object.entries(grouped)) {
      const assignment = assignmentById.get(assignmentId);
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
      batchSize: claimed.length,
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
