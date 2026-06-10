import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import OpenAI from "openai";
import https from "https";
import { HttpsProxyAgent } from "https-proxy-agent";
import nodeFetch from "node-fetch";
import net from "net";

const COMMON_PROXY_PORTS = [7897, 7890, 7893, 10809, 1080];
let hasActiveProxy = false;

function probeLocalPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(150); // Fast 150ms timeout for localhost
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(port, '127.0.0.1');
  });
}

async function getProxyAgent(): Promise<HttpsProxyAgent<any> | null> {
  // 1. If standard environment variables are set, honor them first!
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (envProxy) {
    console.log(`[ProxyDetector] Honoring env proxy configuration: ${envProxy}`);
    hasActiveProxy = true;
    return new HttpsProxyAgent(envProxy);
  }

  // 2. Otherwise, auto-probe common local proxy ports on localhost
  for (const port of COMMON_PROXY_PORTS) {
    const isOpen = await probeLocalPort(port);
    if (isOpen) {
      const detectedProxyUrl = `http://127.0.0.1:${port}`;
      console.log(`[ProxyDetector] Auto-detected active local proxy listening on port ${port}! Routing all API traffic through ${detectedProxyUrl}...`);
      hasActiveProxy = true;
      
      // EXTREMELY IMPORTANT: Set environment variables so ALL Node.js global fetches (Gemini SDK, etc) use the proxy!
      process.env.HTTPS_PROXY = detectedProxyUrl;
      process.env.HTTP_PROXY = detectedProxyUrl;
      
      return new HttpsProxyAgent(detectedProxyUrl);
    }
  }

  console.log(`[ProxyDetector] No active local proxy detected on common ports (${COMMON_PROXY_PORTS.join(', ')}). Using direct connection.`);
  hasActiveProxy = false;
  return null;
}


// Pre-create a Standard HTTPS Agent for direct connections
const standardAgent = new https.Agent({
  keepAlive: false
});

// ==========================================
// GEMINI CLIENT (Vision OCR Phase)
// ==========================================
export function getGeminiClients() {
  const keys: string[] = [];
  if (process.env.GEMINI_API_KEY) keys.push(process.env.GEMINI_API_KEY);
  if (process.env.GEMINI_API_KEYS) {
    keys.push(...process.env.GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean));
  }
  const uniqueKeys = Array.from(new Set(keys));
  if (uniqueKeys.length === 0) return [new GoogleGenAI({})];
  return uniqueKeys.map(apiKey => new GoogleGenAI({ apiKey }));
}

function isKeyError(err: any): boolean {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("suspended") ||
    msg.includes("api_key_invalid") ||
    msg.includes("invalid api key") ||
    msg.includes("permission_denied") ||
    msg.includes("permission denied") ||
    msg.includes("403") ||
    msg.includes("key not valid")
  );
}

function isQuotaError(err: any): boolean {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("resource_exhausted") ||
    msg.includes("limit exceeded")
  );
}

function isNetworkError(err: any): boolean {
  if (!err || !err.message) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("fetch failed") ||
    msg.includes("timeout") ||
    msg.includes("und_err") ||
    msg.includes("econnreset") ||
    msg.includes("econnrefused") ||
    msg.includes("etimedout")
  );
}

// ==========================================
// MINIMAX CLIENT (Primary for Vision & Logic)
// ==========================================
let minimaxClient: OpenAI | null = null;

async function getMinimaxClient() {
  if (minimaxClient) return minimaxClient;
  
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is not defined in the environment. Please add it to your .env file.");
  }
  
  const baseURL = process.env.MINIMAX_BASE_URL || 'https://api.minimax.chat/v1';
  console.log(`[Minimax] Initializing client with baseURL: ${baseURL}`);
  
  const clientOptions: any = {
    baseURL: baseURL,
    apiKey: apiKey,
    maxRetries: 2, 
    timeout: 600000 // Increased to 10 minutes for complex reasoning batching
  };

  const activeProxyAgent = await getProxyAgent();

  clientOptions.fetch = (url: string, init: any) => {
    return nodeFetch(url, {
      ...init,
      agent: activeProxyAgent || standardAgent
    } as any);
  };

  minimaxClient = new OpenAI(clientOptions);
  return minimaxClient;
}

export async function generateContentWithFallback(parts: any[], schema: any, contextStr: string = "AI") {
  // 1. PRIMARY: Try Minimax M3 Vision
  try {
    const ai = await getMinimaxClient();
    const modelName = process.env.MINIMAX_MODEL_NAME || "MiniMax-Text-01";
    console.log(`[${contextStr}] Attempting Primary OCR with Minimax (${modelName})...`);
    
    const openaiContent = parts.map(p => {
      if (p.text) return { type: "text", text: p.text };
      if (p.inlineData) return { type: "image_url", image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` } };
      return { type: "text", text: JSON.stringify(p) };
    });

    const body: any = {
      model: modelName,
      messages: [{ role: "user", content: openaiContent }]
    };
    
    if (schema) {
      body.response_format = { type: "json_object" };
      const textPart = openaiContent.find(c => c.type === "text");
      if (textPart) {
         textPart.text += `\n\nReturn ONLY valid JSON matching this schema: ${JSON.stringify(schema)}`;
      }
    }

    const response = await ai.chat.completions.create(body);
    const responseText = response.choices[0].message.content || "";
    console.log(`[${contextStr}] Minimax handled OCR successfully!`);
    return { text: responseText } as GenerateContentResponse;
  } catch (minimaxErr: any) {
    console.warn(`[${contextStr}] Minimax OCR failed (${minimaxErr.message}). Falling back to Gemini...`);
  }

  // 2. FALLBACK: Gemini
  console.log(`[${contextStr}] Invoking Gemini OCR Fallback...`);
  const aiClients = getGeminiClients();
  const modelsToTry = ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"];
  
  let response;
  let success = false;
  let lastError: any = null;

  outerLoop:
  for (let c = 0; c < aiClients.length; c++) {
    const ai = aiClients[c];
    for (let m = 0; m < modelsToTry.length; m++) {
      const model = modelsToTry[m];
      
      let retries = 2;
      while (retries >= 0) {
        try {
          console.log(`[${contextStr}] Attempting Key ${c + 1}/${aiClients.length} with model ${model}...`);
          
          const config: any = {};
          if (schema) {
            config.responseMimeType = "application/json";
            config.responseSchema = schema;
          }

          response = await ai.models.generateContent({
            model: model,
            contents: [
              {
                role: "user",
                parts: parts
              }
            ],
            config: Object.keys(config).length > 0 ? config : undefined
          });
          success = true;
          break outerLoop;
        } catch (err: any) {
          lastError = err;
          
          // 1. If key is suspended/invalid, skip all remaining models on this key and try next key
          if (isKeyError(err)) {
            console.warn(`[${contextStr}] Key ${c + 1} is suspended or invalid. Skipping this key. Error: ${err.message}`);
            break; // break retry loop, will move to next model, which will immediately fail similarly, or we can break the model loop to be faster. 
            // To immediately skip the key, we should break out of the models loop. Let's do that!
          }

          // 2. If quota/rate limit is reached, wait and retry instead of immediately breaking
          if (isQuotaError(err)) {
            if (retries > 0) {
              console.warn(`[${contextStr}] Key ${c + 1} Model ${model} hit quota limit. Sleeping 10s and retrying...`);
              retries--;
              await new Promise(resolve => setTimeout(resolve, 10000));
              continue;
            } else {
              console.warn(`[${contextStr}] Key ${c + 1} Model ${model} hit quota/rate limits. Trying next model. Error: ${err.message}`);
              break; 
            }
          }

          // 3. If transient network issue and we have retries left, retry after a delay
          if (isNetworkError(err) && retries > 0) {
            console.warn(`[${contextStr}] Network glitch on Key ${c + 1} Model ${model}: ${err.message}. Retrying in 2s (${retries} retries left)...`);
            retries--;
            await new Promise(resolve => setTimeout(resolve, 2000));
            continue; // retry same model
          }

          // 4. Otherwise, log failure and fall back to the next model under the same key
          console.warn(`[${contextStr}] Key ${c + 1} Model ${model} failed: ${err.message}`);
          break; // break retry loop, moves to next model
        }
      }
      
      // If we broke out of the retry loop because of a key error, skip the remaining models for this key.
      // If it was a quota error, do NOT break the model loop, so we try the other models under the same key.
      if (lastError && isKeyError(lastError)) {
        break; // breaks inner model loop, moves to next key c+1
      }
    }
  }

  if (!success) throw lastError;
  return response as GenerateContentResponse;
}

// ==========================================
// DEEPSEEK CLIENT (Logic Reasoning Phase)
// ==========================================

let deepseekClient: OpenAI | null = null;

async function getDeepSeekClient() {
  if (deepseekClient) return deepseekClient;
  
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPSEEK_API_KEY is not defined in the environment. Please add it to your .env file.");
  }
  
  const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
  console.log(`[DeepSeek] Initializing client with baseURL: ${baseURL}`);
  
  const clientOptions: any = {
    baseURL: baseURL,
    apiKey: apiKey,
    maxRetries: 2, // Only retry automatically at SDK level
    timeout: 600000 // Increased to 10 minutes to allow complex reasoning models to stream without timing out
  };

  // Dynamically detect any manual env proxy or local active proxy (e.g. Clash, v2ray)
  const activeProxyAgent = await getProxyAgent();

  // We explicitly override the fetch implementation using node-fetch (which perfectly supports agent configurations).
  // It routes via activeProxyAgent if a proxy is detected, or via standardAgent for highly reliable direct connections!
  clientOptions.fetch = (url: string, init: any) => {
    return nodeFetch(url, {
      ...init,
      agent: activeProxyAgent || standardAgent
    } as any);
  };

  deepseekClient = new OpenAI(clientOptions);
  
  return deepseekClient;
}

function cleanJsonResponse(raw: string | null): string {
  if (!raw) return "";
  let clean = raw.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  clean = clean.replace(/```(?:json)?/g, '').replace(/```/g, '').trim();
  const firstBrace = clean.indexOf('{');
  const lastBrace = clean.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    clean = clean.slice(firstBrace, lastBrace + 1);
  }
  return clean;
}

export async function generateReasoning(
  systemPrompt: string, 
  userPrompt: string, 
  jsonMode: boolean = true,
  modelName: string = "minimax M3", // Use Minimax as default primary
  enableThinking: boolean = false,
  disableFallback: boolean = true // if true, won't fall back to DeepSeek
) {
  // 1. PRIMARY: Try Minimax Reasoning
  let attempt = 0;
  const maxAttempts = 2;
  let lastError = null;

  while (attempt < maxAttempts) {
    try {
      const ai = await getMinimaxClient();
      const actualModelName = process.env.MINIMAX_MODEL_NAME || modelName;
      
      const body: any = {
        model: actualModelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: jsonMode ? { type: "json_object" } : undefined
      };

      console.log(`[Reasoning] Attempting Minimax reasoning (Attempt ${attempt + 1}/${maxAttempts} using ${actualModelName})...`);
      const response = await ai.chat.completions.create(body);
      
      const content = response.choices[0].message.content;
      return jsonMode ? cleanJsonResponse(content) : content;
    } catch (error: any) {
      lastError = error;
      attempt++;
      
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[Reasoning] Minimax API failed: ${error.message}. Retrying in ${(delay / 1000).toFixed(0)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
  }

  if (disableFallback) {
    console.error("[Reasoning] Minimax API Error and fallback is disabled. Throwing error directly:", lastError);
    throw lastError;
  }

  // 2. FALLBACK: DeepSeek
  console.error("[Reasoning] Minimax failed, falling back to DeepSeek for reasoning:", lastError);
  attempt = 0;
  const dsMaxAttempts = 2;
  let dsLastError = null;
  const dsModelName = "deepseek-v4-flash"; // Fallback to fast DeepSeek model

  while (attempt < dsMaxAttempts) {
    try {
      const ai = await getDeepSeekClient();
      const body: any = {
        model: dsModelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        response_format: jsonMode ? { type: "json_object" } : undefined
      };

      if (enableThinking) {
        body.extra_body = { thinking: { type: "enabled" } };
      }

      console.log(`[Reasoning Fallback] Attempting DeepSeek (Attempt ${attempt + 1}/${dsMaxAttempts} using ${dsModelName})...`);
      const response = await ai.chat.completions.create(body);
      
      console.log(`[Reasoning Fallback] DeepSeek successfully handled reasoning!`);
      const content = response.choices[0].message.content;
      return jsonMode ? cleanJsonResponse(content) : content;
    } catch (error: any) {
      dsLastError = error;
      attempt++;
      
      if (attempt < dsMaxAttempts) {
        const delay = Math.pow(2, attempt) * 1000;
        console.warn(`[Reasoning Fallback] DeepSeek API failed: ${error.message}. Retrying in ${(delay / 1000).toFixed(0)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
  }

  console.error("[Reasoning Fallback] Critical: Both Minimax and DeepSeek failed:", dsLastError);
  throw lastError || dsLastError;
}

