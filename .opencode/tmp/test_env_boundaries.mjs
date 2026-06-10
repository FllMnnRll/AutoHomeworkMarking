// Ephemeral env-var boundary test for gradingEngine.ts logic.
// Replicates the EXACT parsing logic from the new code (lines 100-103 and 250-253).

function makePdfScale(envValue) {
  if (envValue === undefined) {
    var parsedScale = parseFloat(undefined);
  } else {
    var parsedScale = parseFloat(envValue);
  }
  return Number.isFinite(parsedScale)
    ? Math.min(3.0, Math.max(0.5, parsedScale))
    : 1.6;
}

function makeCrossValProb(envValue) {
  if (envValue === undefined) {
    var parsedProb = parseFloat(undefined);
  } else {
    var parsedProb = parseFloat(envValue);
  }
  return Number.isFinite(parsedProb)
    ? Math.min(1.0, Math.max(0.0, parsedProb))
    : 0.10;
}

const cases = [
  { label: "undefined (missing env)",   val: undefined, type: "pdf" },
  { label: "'' (empty string)",          val: "",        type: "pdf" },
  { label: "'abc' (non-numeric)",        val: "abc",     type: "pdf" },
  { label: "'-1' (negative, below min)", val: "-1",      type: "pdf" },
  { label: "'0' (below min)",            val: "0",       type: "pdf" },
  { label: "'0.4' (below min)",          val: "0.4",     type: "pdf" },
  { label: "'0.5' (min boundary)",       val: "0.5",     type: "pdf" },
  { label: "'1.6' (default)",            val: "1.6",     type: "pdf" },
  { label: "'3.0' (max boundary)",       val: "3.0",     type: "pdf" },
  { label: "'3.5' (above max)",          val: "3.5",     type: "pdf" },
  { label: "'5' (way above max)",        val: "5",       type: "pdf" },
  { label: "'NaN' literal",              val: "NaN",     type: "pdf" },
  { label: "'Infinity'",                 val: "Infinity",type: "pdf" },
  { label: "'-Infinity'",                val: "-Infinity",type: "pdf" },
];

console.log("=== PDF_RASTER_SCALE ===");
console.log("Expected: invalid/NaN→1.6; 0.5≤x≤3.0; clamped to [0.5, 3.0]");
for (const c of cases) {
  const got = makePdfScale(c.val);
  console.log(`  ${c.label.padEnd(35)} → ${got}`);
}

const probCases = [
  { label: "undefined (missing env)",   val: undefined, type: "prob" },
  { label: "'' (empty string)",          val: "",        type: "prob" },
  { label: "'abc' (non-numeric)",        val: "abc",     type: "prob" },
  { label: "'-1' (negative, below min)", val: "-1",      type: "prob" },
  { label: "'0' (min boundary)",         val: "0",       type: "prob" },
  { label: "'0.10' (default)",           val: "0.10",    type: "prob" },
  { label: "'0.25' (pre-patch value)",   val: "0.25",    type: "prob" },
  { label: "'0.5'",                      val: "0.5",     type: "prob" },
  { label: "'1' (max boundary)",         val: "1",       type: "prob" },
  { label: "'5' (above max)",            val: "5",       type: "prob" },
  { label: "'NaN' literal",              val: "NaN",     type: "prob" },
  { label: "'Infinity'",                 val: "Infinity",type: "prob" },
];

console.log("\n=== CROSS_VAL_PROB ===");
console.log("Expected: invalid/NaN→0.10; 0≤x≤1; clamped to [0, 1]");
for (const c of probCases) {
  const got = makeCrossValProb(c.val);
  console.log(`  ${c.label.padEnd(35)} → ${got}`);
}
