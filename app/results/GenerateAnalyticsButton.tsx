"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

export default function GenerateAnalyticsButton({ assignmentId, isEnabled }: { assignmentId: string, isEnabled: boolean }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/v1/assignments/${assignmentId}/analytics`, { method: "POST" });
      const data = await res.json();
      
      if (!res.ok) {
        alert(data.error || "Failed to generate analytics");
        setIsGenerating(false);
      } else {
        // Redirect to the dynamic analytics page
        router.push(`/analytics?assignmentId=${assignmentId}`);
      }
    } catch (e) {
      console.error(e);
      alert("Failed to connect to analytics engine");
      setIsGenerating(false);
    }
  };

  if (!isEnabled) return null;

  return (
    <button 
      onClick={handleGenerate}
      disabled={isGenerating}
      className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg transition-all 
      bg-gradient-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-500 hover:to-indigo-500 hover:-translate-y-0.5 hover:shadow-indigo-500/30"
    >
      <Sparkles className={`w-4 h-4 ${isGenerating ? "animate-spin" : "animate-pulse"}`} />
      {isGenerating ? "DeepSeek is analyzing..." : "Generate DeepSeek Analytics"}
    </button>
  );
}
