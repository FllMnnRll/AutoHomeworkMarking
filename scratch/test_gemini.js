const { GoogleGenAI } = require("@google/genai");
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
  const apiKey = "AIzaSyDf1osYb9qdoJDq0_tkMeel9kJuPggZYJw";
  console.log("Using API Key:", apiKey ? `${apiKey.substring(0, 8)}...` : "None");
  
  const ai = new GoogleGenAI({ apiKey });

  try {
    console.log("Calling Gemini with model: gemini-3.5-flash...");
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: "Hello! Say 'gemini 3.5 is active' in one sentence."
    });
    console.log("Response text:", response.text);
  } catch (error) {
    console.error("Gemini 3.5 Flash call failed:", error);
  }
}

main();
