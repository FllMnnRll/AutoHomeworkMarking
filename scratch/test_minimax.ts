import fetch from "node-fetch";

async function testEndpoint(url: string) {
  console.log(`\nTesting ${url} ...`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer sk-cp-VTPlWD8VCOZi-JZiBPhHespgd-AbnfonjbIk0knAAChMH7Ss010Gc-bJ9QWbu-_Y4noXZu6sR528b3chuTLAJ6E_Xb7pdFvWwQg1NlShH1GsWMFzLBh937I"
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
  await testEndpoint("https://api.minimaxi.com/v1/chat/completions");
  await testEndpoint("https://api.minimax.chat/v1/chat/completions");
  await testEndpoint("https://api.minimax.io/v1/chat/completions");
}

run();

