import { generateWithDeepSeek } from "./lib/aiClient";

async function run() {
  console.log("=====================================");
  console.log("Testing DeepSeek Connection in Proxy Env");
  console.log("=====================================");
  
  try {
    const startTime = Date.now();
    console.log("Initiating request to DeepSeek API with an INVALID key to test fallback prevention...");
    
    // Sabotage the API key to force a failure
    process.env.DEEPSEEK_API_KEY = "sk-invalid_key_for_testing";

    // Test with fallback disabled (default is now true)
    const result = await generateWithDeepSeek(
      "You are a helpful assistant.",
      "Hello",
      true, 
      "deepseek-chat"
    );
    
    const endTime = Date.now();
    console.log(`\n❌ TEST FAILED: DeepSeek succeeded or fell back to Gemini! This shouldn't happen. Output:`);
    console.log(result);
    
  } catch (error: any) {
    console.log("\n✅ TEST PASSED: DeepSeek connection correctly FAILED without falling back!");
    console.log("Error Message:", error.message);
  }
}

run();
