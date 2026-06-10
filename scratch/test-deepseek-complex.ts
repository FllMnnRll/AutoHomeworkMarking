import OpenAI from "openai";
import fs from "fs";
import path from "path";

function loadEnv() {
  const envPath = path.join(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return {};
  const envContent = fs.readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  envContent.split("\n").forEach(line => {
    const parts = line.split("=");
    if (parts.length >= 2) {
      const key = parts[0].trim();
      let val = parts.slice(1).join("=").trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  });
  return env;
}

const deepSeekSystemPrompt = `
  You are an elite AP Physics grading assistant.
  Pay special attention to free-body diagrams, vector directions (signs), units (e.g. N, m/s^2), and kinematic equations.
  
  CRITICAL MODE INSTRUCTION: Use your advanced mathematical reasoning to deduce the correct steps and evaluate the student's work logically. Apply Error Carried Forward (ECF) where appropriate.
  
  You will be provided with a raw Markdown transcription of a student's homework.
  Your task is to grade it step-by-step.
  
  CRITICAL JSON REQUIREMENT:
  You MUST output a valid JSON object matching exactly this schema (and nothing else):
  {
    "pipeline": [
      {
        "questionNumber": "String (e.g. '1', '2a')",
        "type": "String ('MCQ' or 'FRQ')",
        "ocrQuestionText": "String (The question text itself)",
        "ocrStudentWork": "String (The student's steps/answer)",
        "gradingLogic": "String (Your detailed step-by-step reasoning)",
        "status": "String ('correct', 'error', or 'ecf')",
        "pointsAwarded": "String"
      }
    ],
    "totalScore": Integer (0 to 100 representing the overall percentage correctness)
  }
  
  All LaTeX backslashes inside strings MUST be double-escaped for JSON (e.g. \\\\frac).
`;

const mockTranscription = `
# Student Work

## Question 1 (MCQ)
Question: A block of mass $m = 2.0\\text{ kg}$ is on a frictionless incline of $30^\\circ$. What is its acceleration down the incline?
Options:
A) $4.9\\text{ m/s}^2$
B) $9.8\\text{ m/s}^2$
C) $2.45\\text{ m/s}^2$
D) $0\\text{ m/s}^2$

Student Answer: A
Student Work: $a = g \\sin(30^\\circ) = 9.8 \\times 0.5 = 4.9$. So A is correct.

## Question 2 (FRQ)
Question: Calculate the normal force acting on the block.
Student Answer: $F_N = m g \\cos(30^\\circ) = 2.0 \\times 9.8 \\times \\cos(30^\\circ) = 19.6 \\times 0.866 = 16.97\\text{ N}$.
`;

async function testDeepSeek() {
  const env = loadEnv();
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.error("❌ No DEEPSEEK_API_KEY found in .env");
    return;
  }

  console.log("Initializing OpenAI client for DeepSeek...");
  const ai = new OpenAI({
    baseURL: 'https://api.deepseek.com',
    apiKey: apiKey
  });

  const start = Date.now();
  console.log("Sending complex prompt to deepseek-v4-pro with thinking mode enabled...");
  try {
    const response = await ai.chat.completions.create({
      model: "deepseek-v4-pro",
      messages: [
        { role: "system", content: deepSeekSystemPrompt },
        { role: "user", content: mockTranscription }
      ],
      response_format: { type: "json_object" },
      extra_body: {
        thinking: { type: "enabled" }
      }
    } as any);

    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ Success in ${elapsed}s!`);
    console.log("Content:", response.choices[0].message.content);
  } catch (error: any) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    console.error(`❌ Failed in ${elapsed}s:`, error.message || error);
  }
}

testDeepSeek();
