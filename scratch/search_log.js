const fs = require('fs');
const path = require('path');

const logPath = "C:\\Users\\romeo\\.gemini\\antigravity\\brain\\ffbdade3-c61c-49c2-a20a-30dda75e24f0\\.system_generated\\tasks\\task-1554.log";
if (fs.existsSync(logPath)) {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');
  lines.forEach((line, idx) => {
    if (line.includes('[GradingEngine]') || line.includes('process-next') || line.includes('api/v1/assignments/')) {
      console.log(`${idx + 1}: ${line}`);
    }
  });
} else {
  console.log("Log file not found");
}
