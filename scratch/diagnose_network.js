const https = require("https");

console.log("Diagnosing network connection to Google API...");

// Test global fetch
fetch("https://generativelanguage.googleapis.com")
  .then(res => {
    console.log("Fetch Status:", res.status);
    return res.text();
  })
  .then(text => {
    console.log("Fetch Body length:", text.length);
  })
  .catch(err => {
    console.error("Fetch failed with error details:");
    console.error(err);
    if (err.cause) {
      console.error("Error Cause:", err.cause);
    }
  });

// Test https get
console.log("Testing direct HTTPS GET...");
https.get("https://generativelanguage.googleapis.com", (res) => {
  console.log("HTTPS Status:", res.statusCode);
  res.on("data", (d) => {
    console.log("HTTPS chunk received");
  });
}).on("error", (e) => {
  console.error("HTTPS GET failed with:");
  console.error(e);
});
