"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

export default function AnalyticsProgressBar() {
  const [progress, setProgress] = useState(5);
  const [stepText, setStepText] = useState("Initializing Educational Data Analyst Engine...");

  useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000; // in seconds
      
      let currentProgress = 5;
      let text = "";

      if (elapsed < 8) {
        currentProgress = Math.round(5 + elapsed * 2); // 5% to 21%
        text = "Step 1/4: Reading student graded worksheets...";
      } else if (elapsed < 25) {
        currentProgress = Math.round(21 + (elapsed - 8) * 1.5); // 21% to 46%
        text = "Step 2/4: DeepSeek is evaluating common homework error clusters...";
      } else if (elapsed < 50) {
        currentProgress = Math.round(46 + (elapsed - 25) * 1.2); // 46% to 76%
        text = "Step 3/4: Synthesizing concept mastery metrics (Traffic Lights)...";
      } else if (elapsed < 80) {
        currentProgress = Math.round(76 + (elapsed - 50) * 0.5); // 76% to 91%
        text = "Step 4/4: Formulating AI Remediation Engine (Next Lecture Plan)...";
      } else {
        currentProgress = Math.min(98, Math.round(91 + (elapsed - 80) * 0.1)); // 91% to 98%
        text = "Finalizing reports and saving to database...";
      }

      setProgress(currentProgress);
      setStepText(text);
    }, 500);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-gradient-to-r from-violet-50 to-indigo-50/50 rounded-3xl p-6 shadow-sm border border-indigo-100/50 animate-pulse">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-bold text-indigo-900 text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-indigo-500 animate-spin" />
          AI Class Analytics compiling... (Automatically triggered)
        </h3>
        <span className="font-black text-indigo-600 text-sm">{progress}%</span>
      </div>
      <div className="w-full bg-slate-200/60 rounded-full h-3.5 overflow-hidden shadow-inner">
        <div 
          className="bg-gradient-to-r from-violet-600 to-indigo-600 h-3.5 rounded-full transition-all duration-500 ease-out flex items-center justify-end px-2 shadow-sm"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-indigo-750 mt-3 font-bold flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
        </span>
        {stepText}
      </p>
    </div>
  );
}
