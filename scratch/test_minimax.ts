import fetch from "node-fetch";
import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.join(__dirname, "../.env");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf-8").split("\n").forEach((line) => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join("=").trim().replace(/^"(.*)"$/, "$1");
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

async function testEndpoint(url: string, apiKey: string) {
  console.log(`\nTesting ${url} ...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "MiniMax-Text-01",
        messages: [{ role: "user", content: "hi" }]
      }),
      agent: false
    });
    console.log("Status:", res.status);
    const json = await res.json();
    console.log("Response:", JSON.stringify(json));
  } catch (err: any) {
    console.error("Fetch Error:", err.message);
  }
}

async function run() {
  loadEnv();
  const { resolveSecret } = await import("../lib/secrets");
  const apiKey = resolveSecret("MINIMAX_API_KEY");
  if (!apiKey) {
    console.error("MINIMAX_API_KEY not set in .env");
    process.exit(1);
  }

  await testEndpoint("https://api.minimaxi.com/v1/chat/completions", apiKey);
  await testEndpoint("https://api.minimax.chat/v1/chat/completions", apiKey);
  await testEndpoint("https://api.minimax.io/v1/chat/completions", apiKey);
}

run();

