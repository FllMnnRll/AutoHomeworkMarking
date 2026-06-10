"use client";

import React, { useState } from "react";
import { Sparkles, Calendar, BookOpen, ChevronRight, BarChart2, ShieldAlert, Award, FileSpreadsheet, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AnalyticsHistoryList({ assignmentsWithStats }: { assignmentsWithStats: any[] }) {
  const router = useRouter();
  const [triggeringId, setTriggeringId] = useState<string | null>(null);

  const handleGenerate = async (assignmentId: string) => {
    setTriggeringId(assignmentId);
    try {
      const res = await fetch(`/api/v1/assignments/${assignmentId}/analytics`, { method: "POST" });
      if (res.ok) {
        // Redirect to view progress
        router.push(`/analytics?assignmentId=${assignmentId}`);
        router.refresh();
      } else {
        const data = await res.json();
        alert(data.error || "Failed to trigger analysis compilation");
      }
    } catch (e) {
      console.error(e);
      alert("Error connecting to server");
    } finally {
      setTriggeringId(null);
    }
  };

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      
      {/* Header */}
      <div className="bg-white/60 backdrop-blur-md p-8 rounded-3xl shadow-sm border border-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none"></div>
        <div className="relative z-10">
          <span className="bg-indigo-500/10 border border-indigo-200/50 text-indigo-700 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">
            Data Repository
          </span>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mt-3">Analytics Dashboard / 历史诊断分析中心</h1>
          <p className="text-slate-500 text-sm mt-2 max-w-xl font-semibold leading-relaxed">
            Select an assignment below to view concept traffic lights, student error bug clusters, and AI-generated remediation classroom action plans.
          </p>
        </div>
      </div>

      {/* History Grid */}
      <div className="grid grid-cols-1 gap-4">
        {assignmentsWithStats.map((item) => {
          const hasAnalytics = item.analyticsStatus === "Completed";
          const isGenerating = item.analyticsStatus === "Generating";
          
          return (
            <div 
              key={item.id} 
              className={`bg-white/80 backdrop-blur-md rounded-3xl border shadow-sm p-6 hover:shadow-md hover:scale-[1.005] transition-all flex flex-col md:flex-row justify-between items-start md:items-center gap-6 ${
                isGenerating ? "border-indigo-300 bg-indigo-50/10" : "border-slate-100"
              }`}
            >
              
              {/* Assignment Details */}
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-1 rounded-lg">
                    {item.class?.name || "Unassigned Class"}
                  </span>
                  <span className="bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5" />
                    {item.subject}
                  </span>
                  {hasAnalytics && (
                    <span className="bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-emerald-600" />
                      Report Ready
                    </span>
                  )}
                  {isGenerating && (
                    <span className="bg-indigo-100 text-indigo-800 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 animate-pulse">
                      <Loader2 className="w-3 h-3 text-indigo-600 animate-spin" />
                      Compiling...
                    </span>
                  )}
                  {!hasAnalytics && !isGenerating && (
                    <span className="bg-slate-100 text-slate-500 text-xs font-bold px-2.5 py-1 rounded-lg flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3" />
                      No Analytics
                    </span>
                  )}
                </div>
                
                <h3 className="text-xl font-extrabold text-slate-800 tracking-tight">{item.title}</h3>
                
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-slate-400 text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(item.date).toLocaleDateString()}
                  </span>
                  <span>•</span>
                  <span>{item.submissionsCount} submissions</span>
                </div>
              </div>

              {/* Stats & Actions */}
              <div className="flex items-center gap-6 self-stretch md:self-auto justify-between border-t md:border-t-0 border-slate-100 pt-4 md:pt-0 shrink-0">
                {/* Score badge */}
                {item.submissionsCount > 0 ? (
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 font-bold block uppercase">Class Average</span>
                    <span className="text-2xl font-black text-slate-800 flex items-center gap-1 justify-end">
                      <Award className="w-5 h-5 text-indigo-500" />
                      {item.averageScore}%
                    </span>
                  </div>
                ) : (
                  <div className="text-right text-slate-400 text-xs font-medium">No grades yet</div>
                )}

                {/* Main Call to Action button */}
                <div>
                  {hasAnalytics ? (
                    <Link 
                      href={`/analytics?assignmentId=${item.id}`}
                      className="inline-flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl px-5 py-2.5 text-sm font-extrabold shadow-md hover:shadow-indigo-500/20 hover:-translate-y-0.5 transition-all group"
                    >
                      <BarChart2 className="w-4 h-4" />
                      View Analytics
                      <ChevronRight className="w-4 h-4 text-white/70 group-hover:translate-x-0.5 transition-transform" />
                    </Link>
                  ) : isGenerating ? (
                    <Link 
                      href={`/analytics?assignmentId=${item.id}`}
                      className="inline-flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl px-5 py-2.5 text-sm font-extrabold border border-indigo-100 hover:-translate-y-0.5 transition-all animate-pulse"
                    >
                      <Loader2 className="w-4 h-4 animate-spin" />
                      View Progress
                    </Link>
                  ) : (
                    <button 
                      onClick={() => handleGenerate(item.id)}
                      disabled={item.submissionsCount === 0 || triggeringId === item.id}
                      className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl px-5 py-2.5 text-sm font-extrabold shadow-sm transition-all"
                    >
                      {triggeringId === item.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Sparkles className="w-4 h-4 text-slate-400 group-hover:text-indigo-500" />
                      )}
                      {triggeringId === item.id ? "Triggering..." : "Compile Analytics"}
                    </button>
                  )}
                </div>
              </div>

            </div>
          );
        })}

        {assignmentsWithStats.length === 0 && (
          <div className="bg-white/80 border border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-500">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700">No Assignments Yet</h3>
            <p className="text-sm text-slate-500 mt-1 max-w-sm mx-auto">Create an assignment on the Home page and upload student homework to generate diagnostic dashboards.</p>
          </div>
        )}
      </div>

    </div>
  );
}
