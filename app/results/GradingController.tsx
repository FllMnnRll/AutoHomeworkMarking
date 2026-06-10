"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause } from "lucide-react";

interface GradingControllerProps {
  pendingCount: number;
  completedCount: number;
  totalCount: number;
  isAnalyticsGenerating: boolean;
}

export default function GradingController({ 
  pendingCount, 
  completedCount, 
  totalCount,
  isAnalyticsGenerating
}: GradingControllerProps) {
  const [isActive, setIsActive] = useState(false);
  const router = useRouter();
  const driverRef = useRef(false);

  // Stop active state automatically when no pending tasks
  useEffect(() => {
    if (pendingCount === 0 && isActive) {
      setIsActive(false);
    }
  }, [pendingCount, isActive]);

  // Queue Driver Logic
  useEffect(() => {
    if (!isActive || pendingCount === 0) return;

    let timeoutId: NodeJS.Timeout;
    const driveQueue = async () => {
      if (driverRef.current) return;
      driverRef.current = true;
      try {
        const res = await fetch("/api/v1/assignments/process-next", { method: "POST" });
        const data = await res.json();
        const delay = data.success ? 3000 : 5000;
        timeoutId = setTimeout(driveQueue, delay);
      } catch (e) {
        console.error("Queue driver error:", e);
        timeoutId = setTimeout(driveQueue, 5000);
      } finally {
        driverRef.current = false;
        router.refresh();
      }
    };

    timeoutId = setTimeout(driveQueue, 500);
    return () => {
      clearTimeout(timeoutId);
      driverRef.current = false;
    };
  }, [isActive, pendingCount, router]);

  // UI Refresh logic for BOTH active grading AND analytics generation
  useEffect(() => {
    if (!isActive && !isAnalyticsGenerating) return;
    
    const intervalId = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(intervalId);
  }, [isActive, isAnalyticsGenerating, router]);

  if (pendingCount === 0 && !isAnalyticsGenerating) {
    return null;
  }

  // If ONLY analytics is generating, the AnalyticsProgressBar handles the UI, we just handle the refresh in the background here.
  if (pendingCount === 0 && isAnalyticsGenerating) {
    return null; 
  }

  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-indigo-100">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Grading Queue</h3>
          <p className="text-sm text-slate-500 font-medium">
            {pendingCount} submission{pendingCount !== 1 ? 's' : ''} waiting to be processed
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="font-bold text-indigo-600 text-sm bg-indigo-50 px-3 py-1.5 rounded-lg">
            {completedCount} / {totalCount} Completed
          </span>
          
          {isActive ? (
            <button 
              onClick={() => setIsActive(false)}
              className="flex items-center gap-2 bg-amber-100 text-amber-700 hover:bg-amber-200 px-4 py-2 rounded-xl font-bold text-sm transition-colors shadow-sm"
            >
              <Pause className="w-4 h-4 fill-current" />
              Pause Grading
            </button>
          ) : (
            <button 
              onClick={() => setIsActive(true)}
              className="flex items-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 px-4 py-2 rounded-xl font-bold text-sm transition-all shadow-md shadow-indigo-600/20"
            >
              <Play className="w-4 h-4 fill-current" />
              Start Grading
            </button>
          )}
        </div>
      </div>

      <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden shadow-inner">
        <div 
          className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-3.5 rounded-full transition-all duration-1000 ease-out flex items-center justify-end px-2 shadow-sm"
          style={{ width: `${progressPercent}%` }}
        >
          {progressPercent > 5 && <span className="text-[9px] font-black text-white/90 leading-none">{progressPercent}%</span>}
        </div>
      </div>
      
      {isActive ? (
        <p className="text-xs text-indigo-600 mt-3 font-medium flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          AI is analyzing student submissions sequentially. This may take a moment.
        </p>
      ) : (
        <p className="text-xs text-slate-500 mt-3 font-medium flex items-center gap-1.5">
          <Pause className="w-3.5 h-3.5" />
          Queue is paused. Click "Start Grading" to resume API processing.
        </p>
      )}
    </div>
  );
}
