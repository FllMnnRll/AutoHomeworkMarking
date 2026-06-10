const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

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
  const apiKey = process.env.DEEPSEEK_API_KEY;
  console.log("Using API Key:", apiKey ? `${apiKey.substring(0, 8)}...` : "None");
  
  const openai = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey: apiKey
  });

  try {
    console.log("Retrieving DeepSeek models list...");
    const models = await openai.models.list();
    console.log("Available models:");
    models.data.forEach(m => {
      console.log(`- ${m.id}`);
    });
  } catch (error) {
    console.error("Failed to list models:", error);
  }
}

main();
