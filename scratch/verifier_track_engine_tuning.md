# Verifier Report — track-engine-tuning

**Verdict:** PASS
**File:** `E:\AutoHomeworkMarking\lib\gradingEngine.ts` (620 lines, 29195 bytes post-edit)
**Date:** 2026-06-03
**Verifier:** verifier agent (mvs_38bdfeec1ffe444c850b3a3241bacca9)

---

## Check 1: Cross-Val probability env-driven

**Method:** `Select-String` on file content
**Evidence:**
- `Math\.random\(\) < 0\.25` → **0 matches** (PASS)
- `CROSS_VAL_PROB` → **3 matches** (lines 249, 250, 256), all using `parseFloat` + `Number.isFinite` clamping
- Default value: line 253 → `0.10` ✅
- Range: line 252 → `Math.min(1.0, Math.max(0.0, parsedProb))` → `[0, 1]` ✅
- Stale log strings "25%" / "75%" — only 0.25 mention is in code comment `Default 0.10 (was 0.25)` (intentional)

**Result: PASS**

---

## Check 2: PDF raster scale env-driven

**Method:** `Select-String` on file content
**Evidence:**
- `scale: 2\.0` → **0 matches** (PASS — old hardcoded value gone)
- `PDF_RASTER_SCALE` → **3 matches** (lines 99, 100, 104), all using `parseFloat` + `Number.isFinite` clamping
- Default value: line 103 → `1.6` ✅
- Range: line 102 → `Math.min(3.0, Math.max(0.5, parsedScale))` → `[0.5, 3.0]` ✅
- Only `scale:` reference: line 109 → `page.getViewport({ scale: pdfRasterScale })` (uses the variable, not hardcoded)
- Log line at 104 prints both the resolved value and the raw env var: `PDF raster scale = ${pdfRasterScale} (env PDF_RASTER_SCALE=${process.env.PDF_RASTER_SCALE ?? "unset"}, default 1.6)`

**Result: PASS**

---

## Check 3: JSON.stringify indent removed

**Method:** `Select-String` on file content
**Evidence:**
- `JSON\.stringify\(solvedAnswerKey, null, 2\)` → **0 matches** (old pretty-print gone)
- `JSON\.stringify\(solvedAnswerKey\)` → **2 matches** at lines 408 and 464 (cross-validation prompt and standard comparative prompt)
- Both lines confirmed in context:
  - Line 408: `        ${JSON.stringify(solvedAnswerKey)}` (cross-val prompt)
  - Line 464: `        ${JSON.stringify(solvedAnswerKey)}` (standard prompt)
- No other `, null, 2` JSON.stringify calls remain in the file

**Result: PASS**

---

## Check 4: Critical invariants preserved

**Method:** `Select-String` on file content
**Evidence:**
- `under 15 words` → matches at lines 369, 421, 476 (all 3 system prompts)
- `CRITICAL JSON` → matches at lines 371, 375, 423, 478 (all 3 system prompts)
- `double-escape` (case-insensitive) → matches at lines 373, 395, 425, 480
- `pageNumbers` → matches at lines 381, 444, 526, 545 (schema descriptions + parser)
- `processHomeworkSlice` signature → line 149: `export async function processHomeworkSlice(submissionId: string, imagePath: string)` — **unchanged**
- `getOrTranscribePage` function (lines 14-74) — untouched
- OcrCache hash logic: `base64Data + "|" + prompt` (line 20) — **unchanged**
  - Per-page OCR prompts at lines 195-200, 264-269, 295-312 do NOT embed the master-key JSON, so cache hashes are unaffected
- DB schema: no Prisma model changes; all `prisma.submission.*` and `prisma.ocrCache.*` calls unchanged

**Result: PASS**

---

## Check 5: System prompt byte/word counts (post-edit)

**Method:** Read file, slice into 3 system prompt blocks, count bytes + words.
**Evidence:**

| Block | Lines | Bytes | Words |
|-------|-------|-------|-------|
| Phase A first-submission | 357–396 | 2540 | 313 |
| Cross-Validation prompt | 403–452 | 2663 | 300 |
| Standard comparative | 459–497 | 2157 | 248 |

(For reference: producer's deliverable claimed 619 total lines; actual is 620 — off by 1, immaterial, likely trailing-newline count difference.)

**Token savings on the 2 affected prompts (JSON indent removed):**
- Representative 10-question key: 4620 → 3839 bytes (saved 781 bytes / ~195 tokens per call)
- Representative 20-question key: 8061 → 6500 bytes (saved 1561 bytes / ~390 tokens per call)
- Representative 30-question key: 13975 → 11634 bytes (saved 2341 bytes / ~585 tokens per call)
- 2 affected call sites → 2× per-call savings per grading run
- 20-question key: ~3122 bytes / ~781 tokens saved per grading run

**Producer's claim of "20-30% token savings"** — measured actual is **~16.8-16.9%** of the JSON block, which translates to **~13-15%** of the full system prompt block. Producer's 20-30% claim is a slight overestimate, but the savings are real and significant.

**Result: PASS** (with note: producer's 20-30% token savings claim is slightly inflated; actual measured is ~16.8% on the JSON block / ~13-15% on the full prompt)

---

## Check 6: Env var boundary behavior

**Method:** Replicated the EXACT parsing logic from lines 100-103 and 250-253 in an ephemeral Node script; tested 13 PDF_RASTER_SCALE inputs and 12 CROSS_VAL_PROB inputs including: undefined, empty string, non-numeric, negative, below-min, at-boundary, default, above-max, NaN literal, Infinity, -Infinity.
**Evidence:** (from `E:\AutoHomeworkMarking\.opencode\tmp\test_env_boundaries.mjs`)

```
=== PDF_RASTER_SCALE ===
  undefined (missing env)             → 1.6  ✅ fallback
  '' (empty string)                   → 1.6  ✅ fallback
  'abc' (non-numeric)                 → 1.6  ✅ fallback
  '-1' (negative, below min)          → 0.5  ✅ clamped
  '0' (below min)                     → 0.5  ✅ clamped
  '0.4' (below min)                   → 0.5  ✅ clamped
  '0.5' (min boundary)                → 0.5  ✅ preserved
  '1.6' (default)                     → 1.6  ✅ preserved
  '3.0' (max boundary)                → 3    ✅ preserved
  '3.5' (above max)                   → 3    ✅ clamped
  '5' (way above max)                 → 3    ✅ clamped
  'NaN' literal                       → 1.6  ✅ fallback
  'Infinity'                          → 1.6  ✅ fallback (isFinite catches)
  '-Infinity'                         → 1.6  ✅ fallback

=== CROSS_VAL_PROB ===
  undefined (missing env)             → 0.1  ✅ fallback
  '' (empty string)                   → 0.1  ✅ fallback
  'abc' (non-numeric)                 → 0.1  ✅ fallback
  '-1' (negative, below min)          → 0    ✅ clamped
  '0' (min boundary)                  → 0    ✅ preserved
  '0.10' (default)                    → 0.1  ✅ preserved
  '0.25' (pre-patch value)            → 0.25 ✅ preserved
  '0.5'                               → 0.5  ✅ preserved
  '1' (max boundary)                  → 1    ✅ preserved
  '5' (above max)                     → 1    ✅ clamped
  'NaN' literal                       → 0.1  ✅ fallback
  'Infinity'                          → 0.1  ✅ fallback
```

**Result: PASS** — all 25 test cases behave as expected. Number.isFinite correctly rejects NaN/Infinity, Math.min/Math.max correctly clamps.

---

## Check 7: TypeScript type-check

**Method:** `.\node_modules\.bin\tsc.cmd --noEmit -p tsconfig.json`
**Evidence:**
- Total project errors: **4**
- Errors in `lib/gradingEngine.ts`: **0** ✅
- All 4 errors are in `app/api/v1/assignments/[id]/analytics/route.ts`:
  - Line 169: `Invalid character` (literal `\`` instead of backtick — pre-existing syntax error)
  - Line 169: `Variable declaration expected`
  - Line 214: `'}' expected`
  - Line 214: `Unterminated template literal`
- Confirmed unrelated: the route.ts file uses a literal backslash-escape in a template literal (line 169: `const studentUserPrompt = \``) which is a pre-existing bug, not introduced by this patch.

**Result: PASS** — modified file compiles clean. The 4 pre-existing errors are out of scope for this task.

---

## Check 8: Adversarial probe — what could go wrong?

### Probe A: Could the env-var clamp logic cause a typo / wrong default?
Looked at the new blocks (lines 98-104, 248-256) — both are syntactically correct, both use the same Number.isFinite + Math.min/Math.max pattern, both log the resolved value AND the raw env. No way to silently misbehave.

### Probe B: Could removing JSON indent break the model's ability to parse the key?
No — JSON.parse() and the model itself don't care about whitespace inside JSON. The producer correctly notes "JSON whitespace carries no semantic meaning". Schema fields, types, and ordering are unchanged.

### Probe C: Could the new env-driven scale produce broken PDFs?
The Math.min/Math.max clamp guarantees the scale is always within [0.5, 3.0]. The old hardcoded 2.0 sat squarely within this range. Edge cases (0.5 = half-res, 3.0 = high-res) are valid pdfjs render options.

### Probe D: Could the OcrCache hash change break the cache?
The OcrCache hash uses `base64Data + "|" + prompt` where `prompt` is the per-page OCR prompt (lines 195-200, 264-269, 295-312). These per-page prompts do NOT embed the master-key JSON. Only the DeepSeek system prompt (lines 357-499) embeds the master-key JSON via JSON.stringify — and that string is sent to DeepSeek, not stored in OcrCache. So OcrCache hashes are unchanged.

### Probe E: Could the changes affect processHomeworkSlice return type / DB writes?
processHomeworkSlice signature is unchanged. The downstream flow (resolve pages → call Gemini/DeepSeek → write to DB) is structurally identical. The only change in prompt text is JSON whitespace, which the model treats as identical.

**Result: PASS** — no adversarial probes revealed any defect.

---

## Summary

| Check | Result |
|-------|--------|
| 1. Cross-val prob env-driven | PASS |
| 2. PDF scale env-driven | PASS |
| 3. JSON.stringify indent removed (2 sites) | PASS |
| 4. Critical invariants preserved | PASS |
| 5. System prompt byte/word counts reasonable | PASS (token-savings claim slightly inflated, ~16.8% vs 20-30%) |
| 6. Env var boundary behavior | PASS (25/25 cases) |
| 7. TypeScript type-check | PASS (0 errors in modified file) |
| 8. Adversarial probes | PASS |

### Minor notes (not blocking)

- Producer claimed 20-30% token savings; measured actual is ~16.8% of the JSON block. The savings are real and useful, but the headline number is mildly optimistic.
- Producer's deliverable said "total 619 lines" — actual is 620 (off by 1, immaterial trailing-newline count difference).
- The 4 pre-existing tsc errors in `analytics/route.ts` are confirmed unrelated to this patch (literal `\`` in template literal at line 169 — pre-existing syntax error).

### Verdict: PASS

All three claimed changes are correctly applied, all critical invariants are preserved, the type-check is clean for the modified file, the env-var boundary handling is robust, and the function signature is unchanged. The patch is ready to ship.
