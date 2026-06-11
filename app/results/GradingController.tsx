"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Play, Pause, Layers, AlertTriangle } from "lucide-react";

interface ChunkProgress {
  submissionId: string;
  studentName: string;
  studentId: string;
  pdfChunked: boolean;
  fileSizeMb: number;
  totalPages: number;
  totalChunks: number;
  completedChunks: number;
  processedPages: number;
  parallelWorkers: number;
  phase: "OCR" | "Reasoning" | "Done";
  message: string;
}

interface GradingProgress {
  queuedCount: number;
  processingCount: number;
  completedCount: number;
  totalCount: number;
  hasLargePdfWork: boolean;
  aggregateMessage: string;
  activeChunked: ChunkProgress[];
}

interface GradingControllerProps {
  assignmentId?: string;
  pendingCount: number;
  completedCount: number;
  totalCount: number;
  isAnalyticsGenerating: boolean;
}

export default function GradingController({ 
  assignmentId,
  pendingCount, 
  completedCount, 
  totalCount,
  isAnalyticsGenerating
}: GradingControllerProps) {
  const [isActive, setIsActive] = useState(false);
  const [progress, setProgress] = useState<GradingProgress | null>(null);
  const router = useRouter();
  const driverRef = useRef(false);

  useEffect(() => {
    if (pendingCount === 0 && isActive) {
      setIsActive(false);
    }
  }, [pendingCount, isActive]);

  // Poll chunk-level progress while grading is active
  useEffect(() => {
    if (!assignmentId || (!isActive && pendingCount === 0)) {
      setProgress(null);
      return;
    }

    const fetchProgress = async () => {
      try {
        const res = await fetch(`/api/v1/assignments/grading-progress?assignmentId=${assignmentId}`);
        const data = await res.json();
        if (data.success) setProgress(data);
      } catch (e) {
        console.error("Failed to fetch grading progress:", e);
      }
    };

    fetchProgress();
    const intervalId = setInterval(fetchProgress, 2000);
    return () => clearInterval(intervalId);
  }, [assignmentId, isActive, pendingCount]);

  useEffect(() => {
    if (!isActive || pendingCount === 0) return;

    let timeoutId: NodeJS.Timeout;
    let emptyPolls = 0;
    const driveQueue = async () => {
      if (driverRef.current) return;
      driverRef.current = true;
      try {
        const res = await fetch("/api/v1/assignments/process-next", { method: "POST" });
        const data = await res.json();
        let delay = 5000;
        if (data.success) {
          if (data.batchSize === 0) {
            // Queue is empty: back off exponentially (3s -> 6s -> 12s -> 15s cap)
            emptyPolls++;
            delay = Math.min(15000, 3000 * Math.pow(2, emptyPolls));
          } else {
            emptyPolls = 0;
            delay = 3000;
          }
        }
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

  useEffect(() => {
    if (!isActive && !isAnalyticsGenerating) return;
    
    const intervalId = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(intervalId);
  }, [isActive, isAnalyticsGenerating, router]);

  if (pendingCount === 0 && !isAnalyticsGenerating && !progress?.hasLargePdfWork) {
    return null;
  }

  if (pendingCount === 0 && isAnalyticsGenerating) {
    return null; 
  }

  const displayCompleted = progress?.completedCount ?? completedCount;
  const displayTotal = progress?.totalCount ?? totalCount;
  const displayPending = progress
    ? progress.queuedCount + progress.processingCount
    : pendingCount;

  const progressPercent = displayTotal > 0 ? Math.round((displayCompleted / displayTotal) * 100) : 0;

  const chunkProgressPercent = progress?.activeChunked?.length
    ? Math.round(
        (progress.activeChunked.reduce((s, c) => s + c.completedChunks, 0) /
          Math.max(1, progress.activeChunked.reduce((s, c) => s + c.totalChunks, 0))) *
          100
      )
    : 0;

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-3xl p-6 shadow-sm border border-indigo-100 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-slate-800 text-base">Grading Queue</h3>
          <p className="text-sm text-slate-500 font-medium">
            {displayPending} submission{displayPending !== 1 ? "s" : ""} waiting or in progress
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="font-bold text-indigo-600 text-sm bg-indigo-50 px-3 py-1.5 rounded-lg">
            {displayCompleted} / {displayTotal} Completed
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

      {/* Overall submission progress */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Submission Progress</span>
          <span className="text-xs font-bold text-indigo-600">{progressPercent}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3.5 overflow-hidden shadow-inner">
          <div 
            className="bg-gradient-to-r from-indigo-500 to-indigo-400 h-3.5 rounded-full transition-all duration-1000 ease-out flex items-center justify-end px-2 shadow-sm"
            style={{ width: `${progressPercent}%` }}
          >
            {progressPercent > 5 && <span className="text-[9px] font-black text-white/90 leading-none">{progressPercent}%</span>}
          </div>
        </div>
      </div>

      {/* Large PDF chunk progress */}
      {progress?.hasLargePdfWork && (
        <div className="bg-amber-50/80 border border-amber-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-800">Large PDF Chunk Mode Active</p>
              <p className="text-xs text-amber-700 font-medium mt-0.5">
                {progress.aggregateMessage || "Files exceeding 10 MB are split at page boundaries and graded in parallel."}
              </p>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5" /> Chunk Progress (Parallel Workers)
              </span>
              <span className="text-xs font-bold text-amber-700">{chunkProgressPercent}%</span>
            </div>
            <div className="w-full bg-amber-100 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-gradient-to-r from-amber-500 to-orange-400 h-2.5 rounded-full transition-all duration-700"
                style={{ width: `${chunkProgressPercent}%` }}
              />
            </div>
          </div>

          <div className="space-y-2 max-h-32 overflow-y-auto pr-1">
            {progress.activeChunked.map((chunk) => (
              <div key={chunk.submissionId} className="flex items-center justify-between text-xs bg-white/70 rounded-lg px-3 py-2 border border-amber-100">
                <span className="font-bold text-slate-700 truncate max-w-[140px]">{chunk.studentName}</span>
                <span className="text-amber-700 font-semibold shrink-0 ml-2">
                  {chunk.phase}: {chunk.completedChunks}/{chunk.totalChunks} chunks
                  <span className="text-slate-400 font-medium ml-1">({chunk.parallelWorkers} workers)</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {isActive ? (
        <p className="text-xs text-indigo-600 font-medium flex items-center gap-1.5">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
          </span>
          {progress?.hasLargePdfWork
            ? "AI is processing large PDFs in parallel page chunks. Resuming from each breakpoint page."
            : "AI is analyzing student submissions. This may take a moment."}
        </p>
      ) : (
        <p className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
          <Pause className="w-3.5 h-3.5" />
          Queue is paused. Click &quot;Start Grading&quot; to resume API processing.
        </p>
      )}
    </div>
  );
}
