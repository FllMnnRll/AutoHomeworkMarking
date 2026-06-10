# track-concurrency — verifier notes

## File touched
- `app/api/v1/assignments/process-next/route.ts` (only this file; nothing else)

## What changed (high level)
Single-task `await processHomeworkSlice(...)`  →  N-task `Promise.allSettled([...])`
- `CONCURRENCY_LIMIT` is now read from `process.env.GRADING_CONCURRENCY`, default `3`,
  invalid values (NaN, zero, negative, non-numeric) fall back to `3` with a warning log.
- N queued rows are pulled with `findMany` (`orderBy createdAt asc`, `take N`).
- All N rows are flipped to `'Processing OCR'` inside a single `prisma.$transaction([...])`
  before any grading starts — this is the atomic "claim" step.
- Each row is then graded in parallel via `Promise.allSettled`; one failure does not
  poison the rest of the batch.
- The 15-min stuck-task reset (lines 9–17 in the old file) is preserved verbatim.
- `lib/gradingEngine.ts`, `lib/aiClient.ts`, the Submission schema, and
  `components/GradingController.tsx` are NOT touched.

## End-to-end flow (pseudo-code)

```
POST /process-next
│
├─ 1. resetStuckTasks()                          # unchanged, runs first
│      UPDATE Submission SET status='Queued'
│      WHERE status='Processing OCR' AND updatedAt < now()-15m
│
├─ 2. N = parseInt(GRADING_CONCURRENCY) or 3
│
├─ 3. queued = Submission.findMany({
│        where:   { status: 'Queued' },
│        orderBy: { createdAt: 'asc' },
│        take:    N
│     })
│      if queued.length === 0 → return 200 { batchSize: 0, results: [] }
│
├─ 4. ATOMIC LOCK — single transaction
│      prisma.$transaction(
│        queued.map(s =>
│          prisma.submission.update({
│            where: { id: s.id },
│            data: { status: 'Processing OCR' }
│          })
│        )
│      )
│      ► Other concurrent /process-next calls no longer see these rows in 'Queued'.
│
├─ 5. FAN OUT (parallel)
│      tasks = queued.map(async s => {
│        start = now();
│        try {
│          if (!s.rawImagePath) {
│            UPDATE s SET status='Error during OCR', needsReview=true
│            return { id, durationMs, success:false, errorMessage:'Missing image path…' }
│          }
│          await processHomeworkSlice(s.id, s.rawImagePath);
│          return { id, durationMs, success:true,  errorMessage:null }
│        } catch (err) {
│          return { id, durationMs, success:false, errorMessage: err.message.slice(0,200) }
│        }
│      });
│      settled = await Promise.allSettled(tasks);
│
└─ 6. return 200
       {
         success:    true,            // request itself completed
         batchSize:  queued.length,   // actual count we claimed
         results:    settled.map(...) // one entry per claimed submission
       }
```

Each entry in `results` is shaped exactly as the task spec asked:
```ts
{ id: string, durationMs: number, success: boolean, errorMessage: string | null }
```
with `errorMessage` truncated to the first 200 characters.

## Why a transaction (not a for-loop of single updates)?

`prisma.$transaction(queued.map(...))` is the *array* form: Prisma packs every `update`
into one BEGIN/COMMIT. The two practical benefits:

1. **Atomicity.** Either every selected row is locked to `'Processing OCR'` or none is.
   There is no half-locked state where some rows are 'Processing OCR' and the rest are
   still 'Queued' (which would let a concurrent call race in and grab the others).
2. **Round-trip amortization.** One transaction = one round-trip to the DB server,
   instead of N. For SQLite this also means the implicit write lock is held for one
   short window instead of N sequential ones.

## Race-condition caveats (intentional, out of scope)

The user explicitly asked us NOT to solve the master-key write race, and the
"solvedAnswerKey already exists" assumption for the 9 baseline assignments is
documented in the task. The atomic lock above is a best-effort guard:

- On **SQLite** (the dev DB used here), `BEGIN IMMEDIATE` semantics make the
  transaction serialize naturally — two concurrent calls cannot both read the
  same Queued rows.
- On **PostgreSQL/MySQL**, two transactions can read the same Queued rows
  before either commits, then both flip them to 'Processing OCR' and both
  process them. The downstream `errorMessage` column is owned by gradingEngine
  and the engine is idempotent per submission (writes are not lost), so the
  *visible* damage is a duplicated Gemini OCR call — not corrupt data.

If the team needs a hard mutex later, the upgrade is to wrap the findMany in an
`updateMany` that uses a `createdAt` cursor, or to add a per-assignment
advisory lock. Neither is required for the 9-baseline-run goal of this task.

## What was NOT changed (per the task's "重要不变量")

- `lib/gradingEngine.ts` — untouched, still owns `Submission.errorMessage` writes
  and all Gemini calls / cache logic.
- `lib/aiClient.ts` — untouched, key-rotation / fallback chain still drives itself.
- `prisma/schema.prisma` — no fields added or renamed.
- `components/GradingController.tsx` — untouched; the frontend polling loop is
  unchanged. The old `202 { message: "Queue throttle active" }` path is gone
  (no throttling anymore), but the controller handles `200` and `500` the
  same way it always did, and it polls continuously, so a fire-and-forget
  caller just sees throughput triple.

## Sanity checks performed
- `npx tsc --noEmit -p tsconfig.json` — **0 errors in `process-next/route.ts`**.
  (The 4 errors reported by tsc are pre-existing in
  `app/api/v1/assignments/[id]/analytics/route.ts:169` — escaped backticks in a
  template literal. Out of scope, not introduced by this task.)
- Manual review of the new code path: confirm-findMany, $transaction-lock,
  Promise.allSettled, per-task error capture, response shape.

## How to verify end-to-end (suggested)

```bash
# Reset everything to Queued first (existing helper, no change):
node scratch/reset.js

# Fire a single request and watch it process up to 3 in parallel:
curl -X POST http://localhost:3000/api/v1/assignments/process-next

# Response shape (expected):
# {
#   "success": true,
#   "batchSize": 3,
#   "results": [
#     { "id": "...", "durationMs": 41237, "success": true,  "errorMessage": null },
#     { "id": "...", "durationMs": 39881, "success": true,  "errorMessage": null },
#     { "id": "...", "durationMs": 0,     "success": false, "errorMessage": "Missing image path…" }
#   ]
# }
```

If you want to stress-test the 9-baseline scenario, set `GRADING_CONCURRENCY=3`
in `.env` and call /process-next 3 times in a row — the first call claims 3,
the second claims 3 more, the third claims the last 3. No double-processing.
