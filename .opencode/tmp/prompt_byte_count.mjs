// Extract system prompt blocks from lib/gradingEngine.ts and compare bytes.
// Three system prompts to measure:
//   1. Phase A first-submission prompt (lines 357-396)
//   2. Cross-validation prompt (lines 403-452)
//   3. Standard comparative prompt (lines 459-497)
//
// We do NOT need a "before" version — we know the only text difference is
// JSON.stringify(solvedAnswerKey, null, 2) → JSON.stringify(solvedAnswerKey).
// The pure-whitespace diff is just what the indent argument produces.

import { readFileSync } from 'fs';
const file = readFileSync('E:/AutoHomeworkMarking/lib/gradingEngine.ts', 'utf8');
const lines = file.split(/\r?\n/);

function extract(start, end) {
  return lines.slice(start - 1, end).join('\n');
}

const phaseA = extract(357, 396);
const crossVal = extract(403, 452);
const standard = extract(459, 497);

console.log("=== System prompt block byte counts (post-edit) ===");
console.log(`Phase A first-submission  (lines 357-396): ${phaseA.length} bytes, ${phaseA.split(/\s+/).length} words`);
console.log(`Cross-Validation prompt  (lines 403-452): ${crossVal.length} bytes, ${crossVal.split(/\s+/).length} words`);
console.log(`Standard comparative     (lines 459-497): ${standard.length} bytes, ${standard.split(/\s+/).length} words`);

// The 2 affected prompts have the JSON.stringify(solvedAnswerKey) call.
// We can't measure "before" exactly without git, but we can show the savings
// from removing the indent argument with a representative key.
const sampleKey = [];
for (let i = 1; i <= 20; i++) {
  sampleKey.push({
    questionNumber: String(i),
    pageNumbers: [Math.ceil(i / 5)],
    type: i % 3 === 0 ? "FRQ" : "MCQ",
    ocrQuestionText: `Question ${i} text, with $\\\\frac{a}{b}$ LaTeX.`,
    ocrStudentWork: "Student handwritten work for Q" + i,
    gradingLogic: `Solved Q${i} per master key`,
    status: "correct",
    pointsAwarded: "5",
    standardAnswer: i % 3 === 0 ? `x=${i}` : "B",
    standardSteps: "1. read 2. substitute 3. solve"
  });
}
const pretty = JSON.stringify(sampleKey, null, 2);
const minified = JSON.stringify(sampleKey);
const saved = pretty.length - minified.length;
console.log("\n=== Per-call JSON indent savings (20-question key) ===");
console.log(`JSON.stringify(key, null, 2): ${pretty.length} bytes`);
console.log(`JSON.stringify(key)         : ${minified.length} bytes`);
console.log(`Saved per call              : ${saved} bytes (~${(saved/4).toFixed(0)} tokens)`);
console.log(`There are 2 affected prompts (cross-val + standard) → total per grading run: ${saved*2} bytes saved (${((saved*2/4)).toFixed(0)} tokens)`);

// Sanity: the 2 affected prompts are NEARLY byte-identical except for one
// differs-from-master-key paragraph and the JSON.stringify call.
const cvSet = new Set(crossVal);
const stdSet = new Set(standard);
let diffLines = 0;
for (const c of crossVal) if (!stdSet.has(c)) diffLines++;
for (const s of standard) if (!cvSet.has(s)) diffLines++;
console.log(`\nChar-level diff between cross-val and standard prompts: ~${diffLines} unique chars (different guidance text + JSON.stringify)`);
