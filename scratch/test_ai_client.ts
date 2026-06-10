import { generateContentWithFallback } from "../lib/aiClient";
import * as fs from "fs";
import * as path from "path";

// Manually read and parse .env
const envPath = path.join(__dirname, "../.env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  envContent.split("\n").forEach(line => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^"(.*)"$/, '$1');
      process.env[key] = val;
    }
  });
}

async function main() {
  console.log("Testing fallback and retry logic in aiClient.ts...");
  try {
    const result = await generateContentWithFallback(
      [{ text: "Hello! Say 'gemini 3.5 is active' in one sentence." }],
      null,
      "TestOCR"
    );
    console.log("\nSuccess!");
    console.log("Response text:", result.text);
  } catch (error) {
    console.error("\nOverall test failed:", error);
  }
}

main();
