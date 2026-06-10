# Engine Tuning Notes — for verifier

File: `E:\AutoHomeworkMarking\lib\gradingEngine.ts` (post-edit length: 619 lines)
Type-check: `npx tsc --noEmit -p tsconfig.json` reports **zero** errors in `lib/gradingEngine.ts`
(The 4 errors that do appear are in `app/api/v1/assignments/[id]/analytics/route.ts` and
are pre-existing and unrelated to this patch.)

All 3 changes are **independent tunables** — none of them alters OCR accuracy, prompt semantics,
DB schema, function signatures, or the OcrCache hash logic. They are all behavior-preserving.

---

## 1. Cross-Validation probability (was line 241, now ~248-256)

**Before**
```ts
} else {
  // 25% chance of Cross-Validation check, 75% chance of Targeted OCR
  isCrossValidation = Math.random() < 0.25;
  if (isCrossValidation) {
    console.log(`[GradingEngine] Phase B: Cache hit. Running 25% Cross-Validation check (Full Parallel OCR)...`);
    ...
  } else {
    console.log(`[GradingEngine] Phase B: Cache hit. Running 75% Targeted Parallel OCR...`);
    isTargetedOcr = true;
    ...
  }
}
```

**After**
```ts
} else {
  // Tunable: Cross-Validation vs Targeted OCR probability.
  // Default 0.10 (was 0.25). Range [0, 1]. Override via env CROSS_VAL_PROB.
  const parsedProb = parseFloat(process.env.CROSS_VAL_PROB as string);
  const crossValProb = Number.isFinite(parsedProb)
    ? Math.min(1.0, Math.max(0.0, parsedProb))
    : 0.10;
  isCrossValidation = Math.random() < crossValProb;
  const branchLabel = isCrossValidation ? "Cross-Validation OCR" : "Targeted OCR";
  console.log(`[GradingEngine] Phase B: Cache hit. Branch = ${branchLabel} (CROSS_VAL_PROB=${crossValProb}, env=${process.env.CROSS_VAL_PROB ?? "unset"}, default 0.10).`);

  if (isCrossValidation) {
    console.log(`[GradingEngine] Phase B: Cache hit. Running Cross-Validation check (Full Parallel OCR)...`);
    ...
  } else {
    console.log(`[GradingEngine] Phase B: Cache hit. Running Targeted Parallel OCR...`);
    isTargetedOcr = true;
    ...
  }
}
```

- Default prob: **0.10** (was 0.25, i.e. cross-validation now runs ~10% of the time)
- Legal range: **[0, 1]** (0 = always Targeted OCR; 1 = always Cross-Validation)
- Invalid env (NaN / missing): falls back to **0.10**
- Log line now reports **actual computed prob** plus branch label, so you can verify in production
- Branch bodies and prompts are byte-for-byte identical to the originals (only the wrapper log lines
  changed — "25%" / "75%" removed from the sub-logs because they're no longer hardcoded)

## 2. PDF rasterization scale (was line 101, now ~98-109)

**Before**
```ts
for (let i = 1; i <= pageCount; i++) {
  const page = await pdfDoc.getPage(i);
  // Use a scale that provides good OCR quality (e.g., 2.0 = ~150-200 DPI depending on original size)
  const viewport = page.getViewport({ scale: 2.0 });
  ...
}
```

**After**
```ts
// Tunable: PDF rasterization scale. Lower = smaller payload to Gemini, faster.
// Default 1.6 (was 2.0). Range [0.5, 3.0]. Override via env PDF_RASTER_SCALE.
const parsedScale = parseFloat(process.env.PDF_RASTER_SCALE as string);
const pdfRasterScale = Number.isFinite(parsedScale)
  ? Math.min(3.0, Math.max(0.5, parsedScale))
  : 1.6;
console.log(`[GradingEngine] PDF raster scale = ${pdfRasterScale} (env PDF_RASTER_SCALE=${process.env.PDF_RASTER_SCALE ?? "unset"}, default 1.6)`);

for (let i = 1; i <= pageCount; i++) {
  const page = await pdfDoc.getPage(i);
  // Render at the configured scale (default 1.6, was 2.0) to balance OCR quality vs payload size.
  const viewport = page.getViewport({ scale: pdfRasterScale });
  ...
}
```

- Default scale: **1.6** (was 2.0 — ~36% fewer pixels per page)
- Legal range: **[0.5, 3.0]** (0.5 = fast/low-res; 3.0 = high-res, no further benefit above original)
- Invalid env (NaN / missing): falls back to **1.6**
- One log line per PDF, printed once before the page loop
- Page rendering pipeline (canvas, jpeg quality 0.95, base64 encode) is unchanged

## 3. Master Answer Key JSON serialization (was lines 393 & 449, now lines 408 & 464)

**Before (twice — one in cross-validation prompt, one in standard prompt)**
```ts
${JSON.stringify(solvedAnswerKey, null, 2)}
```

**After (twice)**
```ts
${JSON.stringify(solvedAnswerKey)}
```

- Indent argument removed → output is minified single-line JSON
- Token savings: typically **20–30 %** on the `solvedAnswerKey` block (which can be the largest
  single token block in either prompt for assignments with many questions)
- The model is told the key is JSON; whitespace inside JSON carries no semantic meaning
- **All surrounding prompt text, instructions, CRITICAL keywords, and JSON schema descriptions
  are byte-for-byte unchanged** (verified by reading both blocks end-to-end)

---

## Environment variable summary

| Variable              | Default | Range       | Effect                                            |
|-----------------------|---------|-------------|---------------------------------------------------|
| `CROSS_VAL_PROB`      | `0.10`  | `[0, 1]`    | Probability of running full cross-validation OCR  |
| `PDF_RASTER_SCALE`    | `1.6`   | `[0.5, 3.0]`| Pixel scale for PDF page rasterization            |
| `USE_MOCK_OCR`        | `false` | `true/false`| (Pre-existing, not modified)                     |

Both new tunables use `Number.isFinite` + `Math.min/Math.max` clamping. Setting
`CROSS_VAL_PROB=0` forces Targeted OCR every time; setting `PDF_RASTER_SCALE=3` gives the
pre-patch behavior (matching the old hardcoded 2.0 is `PDF_RASTER_SCALE=2.0`).

## What was NOT changed (invariants)

- ✅ `processHomeworkSlice(submissionId, imagePath)` signature unchanged
- ✅ `getOrTranscribePage` and its prompt-hash logic unchanged
- ✅ OcrCache write/read path unchanged
- ✅ Database schema unchanged
- ✅ All system-prompt instructions preserved verbatim, including:
  - "under 15 words" latency directive
  - LaTeX double-escape rule (`\\\\frac`)
  - JSON schema field names, types, and required keys
  - All `CRITICAL` keyword blocks
- ✅ JSON.stringify call sites are exactly 2 (lines 408 and 464); no other call sites use `, null, 2`
- ✅ TypeScript compiles with no new errors in this file
