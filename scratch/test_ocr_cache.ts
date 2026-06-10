import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function mockGetOrTranscribePage(
  base64Data: string, 
  prompt: string, 
  contextStr: string
): Promise<{ text: string; hit: boolean }> {
  const rawString = base64Data + "|" + prompt;
  const hash = crypto.createHash('md5').update(rawString).digest('hex');

  // Check cache
  const cached = await prisma.ocrCache.findUnique({
    where: { hash }
  });
  
  if (cached) {
    console.log(`[TEST] Cache HIT for ${contextStr} (MD5: ${hash})`);
    return { text: cached.text, hit: true };
  }

  console.log(`[TEST] Cache MISS for ${contextStr} (MD5: ${hash}). Writing to cache...`);
  const mockGeneratedText = `Mock OCR transcription for prompt: "${prompt.substring(0, 30)}..."`;
  
  await prisma.ocrCache.create({
    data: { hash, text: mockGeneratedText }
  });

  return { text: mockGeneratedText, hit: false };
}

async function main() {
  const sampleBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="; // 1x1 png base64
  const samplePrompt = "Transcribe this blank page.";
  const context = "Page 1 Full OCR";

  // Cleanup old cache entries for this specific hash to make test repeatable
  const rawString = sampleBase64 + "|" + samplePrompt;
  const hash = crypto.createHash('md5').update(rawString).digest('hex');
  await prisma.ocrCache.deleteMany({ where: { hash } });

  console.log("=== Run 1: Expect Cache MISS ===");
  const res1 = await mockGetOrTranscribePage(sampleBase64, samplePrompt, context);
  console.log("Result 1:", res1);
  if (res1.hit) throw new Error("Run 1 should be a MISS");

  console.log("\n=== Run 2: Expect Cache HIT ===");
  const res2 = await mockGetOrTranscribePage(sampleBase64, samplePrompt, context);
  console.log("Result 2:", res2);
  if (!res2.hit) throw new Error("Run 2 should be a HIT");

  console.log("\nSUCCESS: Database OCR Caching verified successfully!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
