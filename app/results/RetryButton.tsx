"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

export default function RetryButton({ submissionId }: { submissionId: string }) {
  const [isRetrying, setIsRetrying] = useState(false);
  const router = useRouter();

  const handleRetry = async () => {
    setIsRetrying(true);
    try {
      const res = await fetch("/api/v1/assignments/retry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId })
      });
      if (!res.ok) {
        const data = await res.json();
        alert("Failed to retry: " + (data.error || "Unknown error"));
      } else {
        router.refresh();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to retry");
    } finally {
      // If it immediately finishes (unlikely), or just error, we stop spinning
      // Otherwise, the page refresh will unmount this or update the status
      setTimeout(() => setIsRetrying(false), 2000);
    }
  };

  return (
    <button 
      onClick={handleRetry}
      disabled={isRetrying}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300"
    >
      <RefreshCw className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`} />
      {isRetrying ? "Retrying..." : "Retry"}
    </button>
  );
}
