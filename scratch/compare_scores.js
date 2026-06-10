// compare_scores.js
// Helper: read baseline + after snapshots, produce a comparison table and a regression report.
const fs = require('fs');
const path = require('path');

const baseline = JSON.parse(fs.readFileSync(path.join(__dirname, 'baseline_5.1_hw_test.json'), 'utf8'));
const after    = JSON.parse(fs.readFileSync(path.join(__dirname, 'after_5.1_hw_test.json'), 'utf8'));
const drive    = JSON.parse(fs.readFileSync(path.join(__dirname, 'drive_summary.json'), 'utf8'));

// Build a lookup by submission id
const b = new Map(baseline.submissions.map(s => [s.id, s]));
const a = new Map(after.submissions.map(s => [s.id, s]));

const rows = [];
for (const sub of baseline.submissions) {
  const bSub = b.get(sub.id);
  const aSub = a.get(sub.id);
  const baseScore = bSub?.aiScore ?? null;
  const newScore  = aSub?.aiScore ?? null;
  const delta = (baseScore != null && newScore != null) ? (newScore - baseScore) : null;
  rows.push({
    id: sub.id,
    student: sub.student,
    studentId: sub.studentId,
    baselineStatus: bSub?.status,
    baselineAiScore: baseScore,
    baselineTotal: bSub?.totalScore,
    afterStatus: aSub?.status,
    afterAiScore: newScore,
    afterTotal: aSub?.totalScore,
    afterNeedsReview: aSub?.needsReview,
    afterError: aSub?.errorMessage,
    delta,
    absDelta: delta == null ? null : Math.abs(delta),
  });
}

// Decision counts
let passCount = 0, softFail = 0, hardFail = 0;
for (const r of rows) {
  if (r.delta == null) { hardFail++; continue; }
  if (Math.abs(r.delta) <= 2) passCount++;
  else if (Math.abs(r.delta) <= 5) softFail++;
  else hardFail++;
}

// Timing
const elapsedSec = drive.elapsedSec;
const baselineAssumed = 270;  // 9 × 30s (conservative lower bound from task)
const speedupPctVsConservative = ((baselineAssumed - elapsedSec) / baselineAssumed) * 100;
const speedupPctVsBest = ((180 - elapsedSec) / 180) * 100;  // 9 × 20s best case
const speedupPctVsWorst = ((480 - elapsedSec) / 480) * 100; // 9 × ~53s worst case

// 135s threshold from task
const meets135s = elapsedSec < 135;

let verdict;
if (hardFail === 0 && meets135s) verdict = 'PASS';
else if (hardFail >= 1) verdict = 'FAIL';
else verdict = 'FAIL'; // 5/9 with delta>5 hard-fail accuracy, plus speed FAIL

// Build markdown
const lines = [];
lines.push('# Regression Report — hw5.1 test (9 submissions)');
lines.push('');
lines.push(`**Date:** ${new Date().toISOString()}`);
lines.push(`**Assignment:** ${baseline.assignment.title} (${baseline.assignment.id})`);
lines.push(`**Class:** ${baseline.assignment.className}`);
lines.push(`**AI Mode:** ${baseline.assignment.aiMode}  |  **Evaluation Type:** ${baseline.assignment.evaluationType}`);
lines.push(`**Baseline captured at:** ${baseline.capturedAt}`);
lines.push(`**After captured at:** ${after.capturedAt}`);
lines.push('');
lines.push('---');
lines.push('');
lines.push(`## Verdict: **${verdict}**`);
lines.push('');
lines.push(`- Hard failures (delta > 5): **${hardFail}**`);
lines.push(`- Soft failures (delta 3-5): **${softFail}**`);
lines.push(`- Pass (delta ≤ 2): **${passCount}**`);
lines.push(`- Total elapsed: **${elapsedSec.toFixed(1)} s**`);
lines.push(`- Threshold (< 135 s for +50% speedup): ${meets135s ? 'MET' : 'NOT MET'}`);
lines.push('');
lines.push('---');
lines.push('');

lines.push('## A. Accuracy comparison (aiScore: baseline vs after)');
lines.push('');
lines.push('Tolerance: ±2 PASS, ±3-5 soft warn, ±>5 FAIL (per task spec — prompt simplification + probability changes are non-deterministic).');
lines.push('');
lines.push('| # | Student | ID | Baseline | | After | | Δ | Verdict |');
lines.push('|---|---------|----|----|----|----|----|----|----|');
lines.push('|   |         |    | aiScore | totalScore | aiScore | totalScore |    |    |');
let i = 1;
for (const r of rows) {
  let v;
  if (r.delta == null) v = 'NULL';
  else if (Math.abs(r.delta) <= 2) v = 'PASS';
  else if (Math.abs(r.delta) <= 5) v = 'WARN';
  else v = 'FAIL';
  lines.push(`| ${i} | ${r.student} | ${r.studentId} | ${r.baselineAiScore} | ${r.baselineTotal} | ${r.afterAiScore} | ${r.afterTotal} | ${r.delta > 0 ? '+' : ''}${r.delta} | **${v}** |`);
  i++;
}
lines.push('');
lines.push(`- **${passCount} PASS, ${softFail} WARN, ${hardFail} FAIL** (out of 9)`);
lines.push('');

lines.push('### Highlighting deviations > 5');
lines.push('');
const highDelta = rows.filter(r => r.delta != null && Math.abs(r.delta) > 5);
if (highDelta.length === 0) {
  lines.push('_No submissions with delta > 5._');
} else {
  for (const r of highDelta) {
    lines.push(`- **${r.student}** (id ${r.studentId}, sub ${r.id.slice(0,8)}): baseline aiScore=${r.baselineAiScore} → after=${r.afterAiScore}, delta=${r.delta > 0 ? '+' : ''}${r.delta}.`);
    lines.push(`  - baseline status: ${r.baselineStatus} (needsReview=${r.baselineStatus === 'Needs Review'})`);
    lines.push(`  - after status: ${r.afterStatus} (needsReview=${r.afterNeedsReview}, errorMessage=${r.afterError ? `"${r.afterError.slice(0,80)}"` : 'null'})`);
    lines.push(`  - **Root-cause hypothesis**: the change to DeepSeek prompt (JSON.stringify indent removed) + cross-validation probability (0.25 → 0.10, default) shifted the model's reasoning; OCR cache was a hit for all 9 (no OCR-side variance), so the variation is in DeepSeek's comparative grading path.`);
  }
}
lines.push('');

lines.push('## B. Performance comparison');
lines.push('');
lines.push(`- **Total elapsed: ${elapsedSec.toFixed(1)} s** (= ${(elapsedSec/60).toFixed(2)} min)`);
lines.push(`- 9 submissions processed in 3 parallel batches of 3 (GRADING_CONCURRENCY=3)`);
lines.push('');
lines.push('### Per-task duration (from POST /process-next response `durationMs` field)');
lines.push('');
lines.push('| Submission | Student | Task duration (s) |');
lines.push('|------------|---------|-------------------|');
// Parse from drive_summary (only have the final state, not the per-task times)
// We can read them from drive log; here just show what we have
lines.push('| (See `drive_rerun.js` stdout log for per-task `durationMs` values.) | | |');
lines.push('');

lines.push('### Speedup calculation');
lines.push('');
lines.push('| Baseline assumption | Baseline (s) | New (s) | Speedup % |');
lines.push('|---------------------|--------------|---------|-----------|');
lines.push(`| Best case (9 × 20 s serial) | 180 | ${elapsedSec.toFixed(0)} | ${speedupPctVsBest.toFixed(1)}% |`);
lines.push(`| Conservative (9 × 30 s) | 270 | ${elapsedSec.toFixed(0)} | ${speedupPctVsConservative.toFixed(1)}% |`);
lines.push(`| Worst case (9 × 53 s) | 480 | ${elapsedSec.toFixed(0)} | ${speedupPctVsWorst.toFixed(1)}% |`);
lines.push('');
lines.push(`- Task threshold: 135 s → **${meets135s ? 'MET' : 'NOT MET'}**`);
lines.push(`- 9 submissions / 3-way concurrency = 3 batches. Each batch wall time ≈ slowest task in batch.`);
lines.push(`- The slowest single task in this run was **152.3 s** (Lydia's first task — the prior baseline for this task was probably similar).`);
lines.push('');

lines.push('## C. Decision criteria from task');
lines.push('');
lines.push('| Criterion | Required | Actual | Pass? |');
lines.push('|-----------|----------|--------|-------|');
lines.push(`| 9/9 aiScore within ±2 | Yes | ${passCount}/9 within ±2 | NO (${9-passCount} exceed ±2; ${hardFail} exceed ±5) |`);
lines.push(`| Total elapsed < 135 s | Yes | ${elapsedSec.toFixed(1)} s | NO |`);
lines.push('');
lines.push('→ **VERDICT: FAIL** — accuracy regressed significantly and speed criterion not met under conservative baseline.');
lines.push('');

lines.push('## D. Recommendation');
lines.push('');
lines.push('1. **Revert or tighten the prompt changes** in `lib/gradingEngine.ts`. The JSON.stringify indent removal should be semantically equivalent, but the model appears sensitive to whitespace in this case. Consider:');
lines.push('   - Restore `JSON.stringify(solvedAnswerKey, null, 2)` at lines 408 and 464');
lines.push('   - Re-test — if scores return to baseline values, the regression is confirmed to come from prompt change');
lines.push('2. **Investigate the cross-validation probability change** (0.25 → 0.10). The drop in cross-val may have weakened error-correction on borderline cases. Consider reverting to 0.25 (pre-patch value) and measuring.');
lines.push('3. **The 9 baseline submissions are now in the database with post-regression scores.** Per task Step 6, these have been left in place for user review. To restore the pre-rerun state, re-run `scratch/reset_for_rerun.js` and re-grade (or manually set totalScore to the baseline values).');
lines.push('');

lines.push('## E. Artifacts');
lines.push('');
lines.push('- `scratch/reset_for_rerun.js` — DB reset (slices deleted, status → Queued)');
lines.push('- `scratch/start_dev.js` — dev-server background spawn (PORT=3001, GRADING_CONCURRENCY=3)');
lines.push('- `scratch/drive_rerun.js` — 3 s polling loop on POST /process-next until all 9 are not Queued/Processing');
lines.push('- `scratch/drive_summary.json` — end-of-run timing & status summary');
lines.push('- `scratch/snapshot_after.js` — pulls slice.aiScore + submission.totalScore post-rerun');
lines.push('- `scratch/after_5.1_hw_test.json` — after-snapshot');
lines.push('- `scratch/dev_server.log` — dev server stdout/stderr (timing & per-stage durations visible)');
lines.push('');

// Persist the report
const out = path.join(__dirname, 'regression_report.md');
fs.writeFileSync(out, lines.join('\n'));
console.log('Wrote', out);
console.log('---');
console.log(lines.join('\n'));

// Also dump the summary as JSON for the deliverable
const summary = {
  verdict,
  passCount,
  softFail,
  hardFail,
  elapsedSec,
  meets135s,
  speedupPctVsConservative,
  speedupPctVsBest,
  speedupPctVsWorst,
  rows,
};
fs.writeFileSync(path.join(__dirname, 'regression_summary.json'), JSON.stringify(summary, null, 2));
