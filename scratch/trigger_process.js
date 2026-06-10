async function main() {
  console.log("Triggering process-next...");
  try {
    const res = await fetch("http://localhost:3000/api/v1/assignments/process-next", {
      method: "POST"
    });
    console.log("Status:", res.status);
    const data = await res.json();
    console.log("Response:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error triggering process-next:", error);
  }
}
main();
