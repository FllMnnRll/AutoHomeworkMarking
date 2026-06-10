// Ephemeral byte-count comparison for JSON.stringify indent argument.
// Mirrors the exact 2 call sites in lib/gradingEngine.ts (lines 408 and 464).
// We synthesize a representative solvedAnswerKey (10 questions) matching the
// schema used in the real prompt (questionNumber, pageNumbers, type,
// ocrQuestionText, ocrStudentWork, gradingLogic, status, pointsAwarded,
// standardAnswer, standardSteps).

const sampleKey = [];
for (let i = 1; i <= 10; i++) {
  sampleKey.push({
    questionNumber: String(i),
    pageNumbers: [Math.ceil(i / 4)],
    type: i % 3 === 0 ? "FRQ" : "MCQ",
    ocrQuestionText: `Question ${i} from the master answer key, including LaTeX \\\\frac{a}{b} formatting.`,
    ocrStudentWork: "Student work for question " + i,
    gradingLogic: `Solved Q${i} correctly`,
    status: "correct",
    pointsAwarded: "10",
    standardAnswer: i % 3 === 0 ? `x = ${i}` : String.fromCharCode(64 + (i % 4)),
    standardSteps: `Step 1: read Q${i}. Step 2: substitute. Step 3: solve. Result: ${i}.`
  });
}

const pretty = JSON.stringify(sampleKey, null, 2);
const minified = JSON.stringify(sampleKey);

console.log("=== 10-question key ===");
console.log(`JSON.stringify(key, null, 2)  : ${pretty.length} bytes`);
console.log(`JSON.stringify(key)           : ${minified.length} bytes`);
console.log(`Savings per call              : ${pretty.length - minified.length} bytes (${(((pretty.length - minified.length)/pretty.length)*100).toFixed(1)}%)`);

// Also check a 30-question key (typical large assignment)
const bigKey = [];
for (let i = 1; i <= 30; i++) {
  bigKey.push({
    questionNumber: String(i),
    pageNumbers: [Math.ceil(i / 4)],
    type: i % 3 === 0 ? "FRQ" : "MCQ",
    ocrQuestionText: `Question ${i} from the master answer key, including LaTeX \\\\frac{a}{b} formatting.`,
    ocrStudentWork: "Student work for question " + i,
    gradingLogic: `Solved Q${i} correctly`,
    status: "correct",
    pointsAwarded: "10",
    standardAnswer: i % 3 === 0 ? `x = ${i}` : String.fromCharCode(64 + (i % 4)),
    standardSteps: `Step 1: read Q${i}. Step 2: substitute. Step 3: solve. Result: ${i}.`
  });
}
const bigPretty = JSON.stringify(bigKey, null, 2);
const bigMinified = JSON.stringify(bigKey);
console.log("\n=== 30-question key (large assignment) ===");
console.log(`JSON.stringify(key, null, 2)  : ${bigPretty.length} bytes`);
console.log(`JSON.stringify(key)           : ${bigMinified.length} bytes`);
console.log(`Savings per call              : ${bigPretty.length - bigMinified.length} bytes (${(((bigPretty.length - bigMinified.length)/bigPretty.length)*100).toFixed(1)}%)`);

// Token estimate (rough): 1 token ≈ 4 chars in English/code for Gemini
const t10Saved = (pretty.length - minified.length) / 4;
const t30Saved = (bigPretty.length - bigMinified.length) / 4;
console.log("\n=== Estimated token savings (rough: 1 token ≈ 4 chars) ===");
console.log(`10-q key : ~${t10Saved.toFixed(0)} tokens saved per call`);
console.log(`30-q key : ~${t30Saved.toFixed(0)} tokens saved per call`);
console.log(`(There are 2 call sites — 408 cross-val prompt and 464 standard prompt — so total savings per grading run is 2x the per-call savings.)`);
