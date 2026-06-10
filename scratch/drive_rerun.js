// drive_rerun.js
// Drive the regression: repeatedly hit POST /api/v1/assignments/process-next
// every 3 seconds until all 9 submissions are no longer Queued/Processing OCR.
const { PrismaClient } = require('@prisma/client');

const ASSIGNMENT_ID = 'efff1085-dd55-4cdd-b12a-c8537e4c4d26';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';
const POLL_INTERVAL_MS = 3000;
const HARD_TIMEOUT_MS = 30 * 60 * 1000; // 30 min absolute cap

const p = new PrismaClient();

const inFlightStatuses = new Set(['Queued', 'Processing OCR']);

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

async function callProcessNext() {
  const url = `${BASE_URL}/api/v1/assignments/process-next`;
  try {
    const res = await fetch(url, { method: 'POST' });
    const txt = await res.text();
    let body;
    try { body = JSON.parse(txt); } catch { body = txt.slice(0, 200); }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, error: String(e) };
  }
}

async function getAllStatuses() {
  const subs = await p.submission.findMany({
    where: { assignmentId: ASSIGNMENT_ID },
    select: { id: true, status: true, totalScore: true, errorMessage: true },
    orderBy: { createdAt: 'asc' },
  });
  return subs;
}

function summarize(subs) {
  const counts = {};
  for (const s of subs) counts[s.status] = (counts[s.status] || 0) + 1;
  return counts;
}

(async () => {
  log('Starting drive_rerun against', BASE_URL);

  const start = Date.now();
  let iteration = 0;

  // Initial trigger (in case dev server just started)
  log('=== Initial POST /process-next ===');
  let r = await callProcessNext();
  log('iter0 result:', JSON.stringify(r).slice(0, 400));

  while (true) {
    iteration++;
    const subs = await getAllStatuses();
    const sum = summarize(subs);
    const inFlight = subs.filter(s => inFlightStatuses.has(s.status));
    log(`iter${iteration} subs=${subs.length} summary=${JSON.stringify(sum)} inFlight=${inFlight.length}`);

    if (subs.length === 0) {
      log('No submissions found for this assignment. Aborting.');
      break;
    }

    if (inFlight.length === 0) {
      log('All submissions are no longer Queued/Processing OCR. Done.');
      break;
    }

    if (Date.now() - start > HARD_TIMEOUT_MS) {
      log('HARD TIMEOUT reached, aborting.');
      break;
    }

    // Trigger process-next (skip on first iteration since we just called it)
    if (iteration > 1) {
      r = await callProcessNext();
      log(`iter${iteration} POST result status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  const end = Date.now();
  const elapsedMs = end - start;

  // Final snapshot
  const finalSubs = await getAllStatuses();
  const finalSum = summarize(finalSubs);
  log('=== FINAL ===');
  log(`Elapsed: ${elapsedMs} ms (${(elapsedMs/1000).toFixed(1)} s)`);
  log(`Total iterations: ${iteration}`);
  log(`Status summary: ${JSON.stringify(finalSum)}`);
  for (const s of finalSubs) {
    log(`  ${s.id.slice(0,8)} status=${s.status} totalScore=${s.totalScore} err=${s.errorMessage ? s.errorMessage.slice(0,40) : 'null'}`);
  }

  // Write a small summary JSON for the report
  const fs = require('fs');
  const path = require('path');
  const summary = {
    startedAt: new Date(start).toISOString(),
    endedAt: new Date(end).toISOString(),
    elapsedMs,
    elapsedSec: elapsedMs / 1000,
    iterations: iteration,
    finalStatusSummary: finalSum,
    submissions: finalSubs.map(s => ({
      id: s.id,
      status: s.status,
      totalScore: s.totalScore,
      errorMessage: s.errorMessage,
    })),
  };
  fs.writeFileSync(path.join(__dirname, 'drive_summary.json'), JSON.stringify(summary, null, 2));
  log('Wrote drive_summary.json');

  await p.$disconnect();
})().catch(e => { console.error('FATAL:', e); process.exit(1); });
