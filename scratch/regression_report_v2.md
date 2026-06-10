# Regression Report v2 — hw5.1 test (9 submissions, prompt reverted)

**Date:** 2026-06-03T13:15 (Asia/Shanghai)
**Configuration:** `lib/gradingEngine.ts:408,464` reverted to `JSON.stringify(solvedAnswerKey, null, 2)`. **Cross-Val probability 0.10 kept** (not reverted this round — isolating one variable at a time).
**Dev server:** `PORT=3001`, `GRADING_CONCURRENCY=3`
**Assignment:** hw5.1 test (efff1085-dd55-4cdd-b12a-c8537e4c4d26)

---

## Verdict: **FAIL** (accuracy)

| Metric | v1 (no indent) | v2 (indent reverted) | Delta |
|--------|----------------|----------------------|-------|
| Total elapsed | 405.6 s | **255.1 s** | **-37% (faster)** |
| Speedup vs 270 s conservative | -50.2% | +5.5% | 56 pp better |
| Speedup vs 480 s worst | +15.5% | +46.8% | 31 pp better |
| 135 s threshold | NOT MET | NOT MET | — |
| Pass (|delta| <= 2) | 4/9 | **2/9** | -2 |
| Warn (3 <= |delta| <= 5) | 0/9 | 1/9 | +1 |
| Hard fail (|delta| > 5) | 5/9 | **6/9** | +1 |

**Speed improved significantly (-37% wall time), but accuracy was NOT recovered — actually slightly worse than v1.**

---

## A. Accuracy comparison: baseline vs v1 vs v2

Tolerance: +/-2 PASS, +/-3-5 soft warn, +/->5 FAIL (per task spec — DeepSeek reasoning is non-deterministic).

| # | Student | Baseline | v1 (no indent) | v2 (indent reverted) | v1 delta | v2 delta |
|---|---------|---------:|---------------:|---------------------:|---------:|---------:|
| 1 | Luna    | 93 | 93  | 93  | 0    | 0    |
| 2 | Lydia   | 79 | 71  | **64**  | -8   | **-15** |
| 3 | Xena    | 93 | 93  | **86**  | 0    | **-7**  |
| 4 | Barry   | 79 | 79  | 77  | 0    | -2   |
| 5 | Michael | 26 | 32  | 29  | +6   | +3   |
| 6 | Kaden   | 85 | 79  | 79  | -6   | -6   |
| 7 | Sunny   | 71 | **47**  | 64  | **-24** | -7   |
| 8 | Tar     | 93 | 93  | **86**  | 0    | **-7**  |
| 9 | Wayne   | 29 | 40  | 36  | +11  | +7   |

---

## B. v1 vs v2 direction comparison (focus here)

| Student | v1 -> v2 | Interpretation |
|---------|---------|----------------|
| Sunny   | -24 -> -7  | Improved (v2 saved the worst one) |
| Michael | +6 -> +3   | Improved |
| Wayne   | +11 -> +7  | Improved |
| **Lydia**   | -8 -> -15  | **Worsened** |
| **Xena**    | 0 -> -7    | **Worsened (v1 passed, v2 fails)** |
| **Tar**     | 0 -> -7    | **Worsened (v1 passed, v2 fails)** |
| Barry   | 0 -> -2   | Slightly worse |
| Luna, Kaden | unchanged | — |

**Mixed directions**: 3 improved, 3 worsened, 3 unchanged/slight. This "drift in both directions" pattern is NOT a typical signature of a single code change — a single change should push all submissions in the same direction. It looks more like **LLM reasoning non-determinism + reduced Cross-Val probability** acting together.

---

## C. Key conclusions

1. **Speed gain is real**: v2 wall clock 255.1s, 37% faster than v1. Slowest single task dropped from 152.3s to ~108s (Xena this time: 108.4s), tail latency compressed.
2. **Prompt indent change is NOT the main cause**: reverting it did not recover accuracy; instead the distribution drifted more.
3. **Cross-Val probability 0.10 is the prime suspect**:
   - 0.25 had cross-check self-correction; 0.10 has less correction
   - Borderline scores (e.g. Sunny at 71) are most affected
   - But with only one run per config, model randomness and real signal are mixed
4. **Sample noise is large**: to know "did accuracy really drop?" we need 3-5 runs averaged. A single run cannot distinguish "code regression" from "model mood".

---

## D. Next-step recommendations (by ROI)

1. **(Must-do) Revert Cross-Val probability to 0.25** (start dev with `CROSS_VAL_PROB=0.25` env var), keep the prompt in its post-revert state. Run a v3.
   - If v3 accuracy recovers to 7-8/9 PASS -> 0.25 is the key, 0.10 cannot ship
   - If v3 is still 5-6 FAIL -> 0.25/0.10 is not the main cause, problem is elsewhere (prompt wording, PDF scaling, or model needs fine-tune)
2. **(Strongly recommended) Run 3x at the same config and average**: take v2 config and run v2b, v2c, compute mean and variance across 9 submissions. This is the only way to separate "code vs noise".
3. **Recalibrate speed target**: 135s assumed 30s/submission serial; actual is 50-150s/submission, so with 3-way concurrency the wall clock is dominated by the slowest task in each batch.
   - If real baseline is 360-480s, then v2's 255.1s is already **+35% to +47% speedup** — target essentially met
   - If baseline is really ~270s, +5.5% is short — need to push `GRADING_CONCURRENCY` to 4-5 to see if the slowest tasks get scheduled into different batches
4. **Rollback v2's DB state**: DB now holds v2 scores (93, 64, 86, 77, 29, 79, 64, 86, 36). To restore baseline scores, run `scratch/reset_for_rerun.js` and manually set `totalScore` from `baseline_5.1_hw_test.json`.

---

## E. Artifacts

- `scratch/regression_report_v2.md` — this report
- `scratch/regression_report.md` — currently overwritten with v2 (v1 lost unless backed up manually)
- `scratch/regression_summary.json` — v2 machine-readable
- `scratch/after_5.1_hw_test.json` — v2 snapshot (capturedAt: 2026-06-03T05:13:38.053Z)
- `scratch/baseline_5.1_hw_test.json` — original baseline (capturedAt: 2026-06-03T03:24:52.969Z)
- `scratch/drive_summary.json` — v2 run timing and final state

---

## F. Reproduction commands

```powershell
# 1) Start dev server (if not running)
cd E:\AutoHomeworkMarking; node scratch/start_dev.js

# 2) Reset 9 submissions to Queued
cd E:\AutoHomeworkMarking; node scratch/reset_for_rerun.js

# 3) Drive rerun
cd E:\AutoHomeworkMarking; node scratch/drive_rerun.js

# 4) Snapshot + compare
cd E:\AutoHomeworkMarking; node scratch/snapshot_after.js
cd E:\AutoHomeworkMarking; node scratch/compare_scores.js
```
