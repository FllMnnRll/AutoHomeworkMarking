"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, AlertTriangle, ArrowLeft, Users, FileText, CheckCircle2, ChevronRight, BarChart2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AnalyticsProgressBar from "@/app/results/AnalyticsProgressBar";

export default function ClassAnalyticsClient({ 
  assignment, 
  analytics: initialAnalytics, 
  submissions 
}: { 
  assignment: any; 
  analytics: any; 
  submissions: any[]; 
}) {
  const [analytics, setAnalytics] = useState(initialAnalytics);
  const router = useRouter();
  const id = assignment.id;

  const isGenerating = analytics?.status === "Generating";

  // Poll for completion if it's currently generating
  useEffect(() => {
    if (!isGenerating) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/assignments/${id}/analytics`);
        const data = await res.json();
        
        if (data.status === "Completed" || data.status === "Error") {
          setAnalytics(data);
          clearInterval(interval);
          router.refresh();
        }
      } catch (e) {
        console.error("Polling class analytics status failed:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [isGenerating, id, router]);

  // Parse fields
  let concepts = [];
  let errorClusters = [];
  let remediation = null;

  if (analytics?.status === "Completed") {
    try {
      concepts = typeof analytics.concepts === "string" ? JSON.parse(analytics.concepts) : analytics.concepts;
      errorClusters = typeof analytics.errorClusters === "string" ? JSON.parse(analytics.errorClusters) : analytics.errorClusters;
      remediation = typeof analytics.remediation === "string" ? JSON.parse(analytics.remediation) : analytics.remediation;
    } catch (e) {
      console.error("Parsing JSON analytics error:", e);
    }
  }

  return (
    <div className="max-w-7xl mx-auto w-full space-y-6">
      
      {/* Navigation Headers */}
      <div className="flex justify-between items-center bg-white/60 backdrop-blur-md p-4 rounded-2xl border border-white shadow-sm shrink-0">
        <Link href="/analytics" className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to History Dashboard
        </Link>
        <Link href={`/results?assignmentId=${assignment.id}`} className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 border border-slate-200 rounded-xl font-bold text-slate-700 hover:text-indigo-600 transition-colors shadow-sm text-sm">
          <Users className="w-4 h-4" /> Go to Class Results
        </Link>
      </div>

      {isGenerating ? (
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="bg-white/60 backdrop-blur-md p-8 rounded-3xl border border-white text-center space-y-2">
            <h1 className="text-3xl font-extrabold text-slate-900">{assignment.title}</h1>
            <p className="text-indigo-600 font-bold">Class Analytics Compilation in Progress...</p>
          </div>
          <AnalyticsProgressBar />
        </div>
      ) : analytics?.status === "Error" ? (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-8 text-center space-y-4">
          <AlertTriangle className="w-12 h-12 text-rose-500 mx-auto" />
          <div>
            <h3 className="font-bold text-rose-900 text-lg">Analytics Generation Failed</h3>
            <p className="text-rose-700 text-sm mt-2 max-w-lg mx-auto">The AI encountered a formatting error while compiling the diagnostic report. Please return to the class results page and click "Generate Class Analytics" to retry.</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
          
          {/* Dashboard Header */}
          <div className="bg-white/60 backdrop-blur-md p-6 rounded-3xl shadow-sm border border-white flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
            <div>
              <span className="bg-indigo-500/10 border border-indigo-200/50 text-indigo-700 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">
                Class Performance Report
              </span>
              <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight mt-3">{assignment.title}</h1>
              <p className="text-indigo-600 font-bold mt-2 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500"></span> {assignment.class?.name || "AP Student Class"} • Graded Submissions: {submissions.length}
              </p>
            </div>
          </div>

          {/* Core Analytics Blocks */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Unmastered Concepts List */}
            <div className="col-span-1 md:col-span-2 bg-white/80 backdrop-blur-md rounded-3xl shadow-lg border border-white p-8 hover:shadow-xl transition-shadow">
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                ⚠️ 普遍未掌握的知识点
              </h2>
              <div className="space-y-4">
                {concepts && concepts.map((concept: any, idx: number) => (
                  <div key={idx} className="flex flex-col p-4 bg-amber-50 rounded-2xl border border-amber-200 hover:scale-[1.01] transition-transform">
                    <span className="font-extrabold text-amber-900 text-lg mb-1">{concept.name}</span>
                    <span className="text-amber-800 font-semibold text-sm">{concept.description}</span>
                  </div>
                ))}
                {(!concepts || concepts.length === 0) && (
                  <div className="text-center text-slate-400 py-10 font-bold text-sm">本次练习没有发现班级普遍未掌握的知识点。</div>
                )}
              </div>
            </div>

            {/* Top Error Bug Clustering */}
            <div className="col-span-1 bg-white/80 backdrop-blur-md rounded-3xl shadow-lg border border-white p-8 hover:shadow-xl transition-shadow">
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                🐞 Top Error Clusters / 易错点聚类
              </h2>
              <ul className="space-y-5">
                {errorClusters && errorClusters.map((cluster: any, idx: number) => (
                  <li key={idx} className="flex gap-4 p-3 hover:bg-slate-50 rounded-xl transition-colors">
                    <div className="bg-indigo-100 text-indigo-700 font-black rounded-lg px-2.5 py-1.5 text-xs h-fit shadow-sm">{cluster.question}</div>
                    <div>
                      <p className="text-sm font-extrabold text-slate-800 leading-snug">{cluster.description}</p>
                      <p className={`text-xs font-bold mt-1.5 flex items-center gap-1 ${cluster.severity === 'red' ? 'text-red-500' : 'text-amber-500'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${cluster.severity === 'red' ? 'bg-red-500' : 'bg-amber-500'}`}></span> {cluster.affectedCount} students affected
                      </p>
                    </div>
                  </li>
                ))}
                {(!errorClusters || errorClusters.length === 0) && (
                  <div className="text-center text-slate-400 py-10 font-bold text-sm">No error clusters identified.</div>
                )}
              </ul>
            </div>
          </div>

          {/* Remediation Engine */}
          {remediation && (
            <div className="bg-gradient-to-br from-indigo-600 to-blue-600 rounded-3xl shadow-xl p-8 relative overflow-hidden text-white">
              <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none"></div>
              
              <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3 relative z-10">
                <span>✨</span> AI Remediation Engine (Next Lecture Plan)
              </h2>
              
              <div className="bg-white/10 backdrop-blur-md border border-white/20 p-6 rounded-2xl text-white leading-relaxed relative z-10 shadow-inner">
                <p className="mb-3 text-[10px] text-indigo-200 font-black tracking-widest uppercase flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse"></span> Critical Class Vulnerability
                </p>
                <p className="text-lg font-bold leading-snug">
                  {remediation.vulnerability}
                </p>
                <div className="mt-6 border-l-4 border-indigo-400 pl-5 text-indigo-950 bg-white p-5 rounded-xl shadow-lg">
                  <strong className="text-indigo-600 uppercase tracking-wider text-xs block mb-1">Recommended Remediation Action Plan</strong>
                  <p className="font-extrabold text-base leading-relaxed text-slate-800">{remediation.actionPlan}</p>
                </div>

              </div>
            </div>
          )}

          {/* Student Analytics List - Bridging individual reports */}
          <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-lg border border-white p-8">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2 border-b border-slate-100 pb-4">
              <Users className="w-5 h-5 text-indigo-500" />
              Student Diagnostic Reports / 学生诊断分析报告
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {submissions.map((sub) => (
                <div key={sub.id} className="bg-white hover:bg-indigo-50/20 border border-slate-100 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between gap-4">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-xs text-slate-400 font-bold">ID: {sub.student.studentId}</span>
                      <span className={`text-sm font-black ${sub.totalScore >= 90 ? 'text-emerald-600' : sub.totalScore >= 60 ? 'text-indigo-600' : 'text-amber-600'}`}>{sub.totalScore}%</span>
                    </div>
                    <h4 className="font-extrabold text-slate-800 text-lg mt-1">{sub.student.name}</h4>
                    <p className="text-xs text-slate-400 mt-1 font-semibold">Status: {sub.status}</p>
                  </div>
                  <Link 
                    href={`/analytics?submissionId=${sub.id}`}
                    className="inline-flex items-center justify-center gap-1.5 w-full bg-slate-50 border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/40 text-slate-700 hover:text-indigo-700 rounded-xl py-2 text-xs font-extrabold transition-all group"
                  >
                    <FileText className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500" />
                    Student Analytics Profile
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-400 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </div>
              ))}
              {submissions.length === 0 && (
                <div className="col-span-3 text-center text-slate-400 py-10 font-bold text-sm">No graded student worksheets found.</div>
              )}
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
