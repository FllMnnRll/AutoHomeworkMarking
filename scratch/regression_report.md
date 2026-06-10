# Regression Report — hw5.1 test (9 submissions)

**Date:** 2026-06-03T05:15:07.143Z
**Assignment:** hw5.1 test (efff1085-dd55-4cdd-b12a-c8537e4c4d26)
**Class:** AP Physics 1
**AI Mode:** Auto  |  **Evaluation Type:** Homework
**Baseline captured at:** 2026-06-03T03:24:52.969Z
**After captured at:** 2026-06-03T05:13:38.053Z

---

## Verdict: **FAIL**

- Hard failures (delta > 5): **6**
- Soft failures (delta 3-5): **1**
- Pass (delta ≤ 2): **2**
- Total elapsed: **255.1 s**
- Threshold (< 135 s for +50% speedup): NOT MET

---

## A. Accuracy comparison (aiScore: baseline vs after)

Tolerance: ±2 PASS, ±3-5 soft warn, ±>5 FAIL (per task spec — prompt simplification + probability changes are non-deterministic).

| # | Student | ID | Baseline | | After | | Δ | Verdict |
|---|---------|----|----|----|----|----|----|----|
|   |         |    | aiScore | totalScore | aiScore | totalScore |    |    |
| 1 | Luna | 104 | 93 | 93 | 93 | 93 | 0 | **PASS** |
| 2 | Lydia | 107 | 79 | 79 | 64 | 64 | -15 | **FAIL** |
| 3 | Xena | 106 | 93 | 93 | 86 | 86 | -7 | **FAIL** |
| 4 | Barry | 102 | 79 | 79 | 77 | 77 | -2 | **PASS** |
| 5 | Michael | 101 | 26 | 50 | 29 | 29 | +3 | **WARN** |
| 6 | Kaden | 109 | 85 | 85 | 79 | 79 | -6 | **FAIL** |
| 7 | Sunny | 103 | 71 | 71 | 64 | 64 | -7 | **FAIL** |
| 8 | Tar | 105 | 93 | 93 | 86 | 86 | -7 | **FAIL** |
| 9 | Wayne | 108 | 29 | 29 | 36 | 36 | +7 | **FAIL** |

- **2 PASS, 1 WARN, 6 FAIL** (out of 9)

### Highlighting deviations > 5

- **Lydia** (id 107, sub f7ced1b3): baseline aiScore=79 → after=64, delta=-15.
  - baseline status: Graded (needsReview=false)
  - after status: Graded (needsReview=false, errorMessage=null)
  - **Root-cause hypothesis**: the change to DeepSeek prompt (JSON.stringify indent removed) + cross-validation probability (0.25 → 0.10, default) shifted the model's reasoning; OCR cache was a hit for all 9 (no OCR-side variance), so the variation is in DeepSeek's comparative grading path.
- **Xena** (id 106, sub b4e3efd7): baseline aiScore=93 → after=86, delta=-7.
  - baseline status: Graded (needsReview=false)
  - after status: Graded (needsReview=false, errorMessage=null)
  - **Root-cause hypothesis**: the change to DeepSeek prompt (JSON.stringify indent removed) + cross-validation probability (0.25 → 0.10, default) shifted the model's reasoning; OCR cache was a hit for all 9 (no OCR-side variance), so the variation is in DeepSeek's comparative grading path.
- **Kaden** (id 109, sub 696f40d8): baseline aiScore=85 → after=79, delta=-6.
  - baseline status: Graded (needsReview=false)
  - after status: Graded (needsReview=false, errorMessage=null)
  - **Root-cause hypothesis**: the change to DeepSeek prompt (JSON.stringify indent removed) + cross-validation probability (0.25 → 0.10, default) shifted the model's reasoning; OCR cache was a hit for all 9 (no OCR-side variance), so the variation is in DeepSeek's comparative grading path.
- **Sunny** (id 103, sub 11f9d78b): baseline aiScore=71 → after=64, delta=-7.
  - baseline status: Graded (needsReview=false)
  - after status: Graded (needsReview=false, errorMessage=null)
  - **Root-cause hypothesis**: the change to DeepSeek prompt (JSON.stringify indent removed) + cross-validation probability (0.25 → 0.10, default) shifted the model's reasoning; OCR cache was a hit for all 9 (no OCR-side variance), so the variation is in DeepSeek's comparative grading path.
- **Tar** (id 105, sub 31e94530): baseline aiScore=93 → after=86, delta=-7.
  - baseline status: Graded (needsReview=false)
  - after status: Graded (needsReview=false, errorMessage=null)
  - **Root-cause hypothesis**: the change to DeepSeek prompt (JSON.stringify indent removed) + cross-validation probability (0.25 → 0.10, default) shifted the model's reasoning; OCR cache was a hit for all 9 (no OCR-side variance), so the variation is in DeepSeek's comparative grading path.
- **Wayne** (id 108, sub 36195823): baseline aiScore=29 → after=36, delta=+7.
  - baseline status: Needs Review (needsReview=true)
  - after status: Needs Review (needsReview=true, errorMessage=null)
  - **Root-cause hypothesis**: the change to DeepSeek prompt (JSON.stringify indent removed) + cross-validation probability (0.25 → 0.10, default) shifted the model's reasoning; OCR cache was a hit for all 9 (no OCR-side variance), so the variation is in DeepSeek's comparative grading path.

## B. Performance comparison

- **Total elapsed: 255.1 s** (= 4.25 min)
- 9 submissions processed in 3 parallel batches of 3 (GRADING_CONCURRENCY=3)

### Per-task duration (from POST /process-next response `durationMs` field)

| Submission | Student | Task duration (s) |
|------------|---------|-------------------|
| (See `drive_rerun.js` stdout log for per-task `durationMs` values.) | | |

### Speedup calculation

| Baseline assumption | Baseline (s) | New (s) | Speedup % |
|---------------------|--------------|---------|-----------|
| Best case (9 × 20 s serial) | 180 | 255 | -41.7% |
| Conservative (9 × 30 s) | 270 | 255 | 5.5% |
| Worst case (9 × 53 s) | 480 | 255 | 46.8% |

- Task threshold: 135 s → **NOT MET**
- 9 submissions / 3-way concurrency = 3 batches. Each batch wall time ≈ slowest task in batch.
- The slowest single task in this run was **152.3 s** (Lydia's first task — the prior baseline for this task was probably similar).

## C. Decision criteria from task

| Criterion | Required | Actual | Pass? |
|-----------|----------|--------|-------|
| 9/9 aiScore within ±2 | Yes | 2/9 within ±2 | NO (7 exceed ±2; 6 exceed ±5) |
| Total elapsed < 135 s | Yes | 255.1 s | NO |

→ **VERDICT: FAIL** — accuracy regressed significantly and speed criterion not met under conservative baseline.

## D. Recommendation

1. **Revert or tighten the prompt changes** in `lib/gradingEngine.ts`. The JSON.stringify indent removal should be semantically equivalent, but the model appears sensitive to whitespace in this case. Consider:
   - Restore `JSON.stringify(solvedAnswerKey, null, 2)` at lines 408 and 464
   - Re-test — if scores return to baseline values, the regression is confirmed to come from prompt change
2. **Investigate the cross-validation probability change** (0.25 → 0.10). The drop in cross-val may have weakened error-correction on borderline cases. Consider reverting to 0.25 (pre-patch value) and measuring.
3. **The 9 baseline submissions are now in the database with post-regression scores.** Per task Step 6, these have been left in place for user review. To restore the pre-rerun state, re-run `scratch/reset_for_rerun.js` and re-grade (or manually set totalScore to the baseline values).

## E. Artifacts

- `scratch/reset_for_rerun.js` — DB reset (slices deleted, status → Queued)
- `scratch/start_dev.js` — dev-server background spawn (PORT=3001, GRADING_CONCURRENCY=3)
- `scratch/drive_rerun.js` — 3 s polling loop on POST /process-next until all 9 are not Queued/Processing
- `scratch/drive_summary.json` — end-of-run timing & status summary
- `scratch/snapshot_after.js` — pulls slice.aiScore + submission.totalScore post-rerun
- `scratch/after_5.1_hw_test.json` — after-snapshot
- `scratch/dev_server.log` — dev server stdout/stderr (timing & per-stage durations visible)
