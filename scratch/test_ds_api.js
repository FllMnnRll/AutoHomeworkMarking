const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

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
  const apiKey = process.env.DEEPSEEK_API_KEY;
  const openai = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: apiKey
  });

  console.log("Calling deepseek-v4-flash (no thinking)...");
  const start = Date.now();
  try {
    const response = await openai.chat.completions.create({
      model: "deepseek-v4-flash",
      messages: [
        { role: "user", content: "Hello! Say 'API is online' if you can hear me." }
      ]
    });
    console.log("Success! Response:", response.choices[0].message.content.trim());
    console.log(`Time taken: ${((Date.now() - start) / 1000).toFixed(1)}s`);
  } catch (err) {
    console.error("API Call Failed:", err);
  }
}

main();
