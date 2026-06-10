"use client";

import React, { useEffect, useState } from "react";
import { Sparkles, ArrowLeft, BarChart2, CheckCircle2, AlertTriangle, BookOpen, GraduationCap, Loader2 } from "lucide-react";
import Link from "next/link";
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

// Math Renderer helper
const MathRenderer = ({ content }: { content: string }) => {
  if (!content) return null;
  const parts = content.split(/(\$\$[\s\S]*?\$\$|\$[\s\S]*?\$)/g);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((part, i) => {
        try {
          if (part.startsWith('$$') && part.endsWith('$$')) {
            return <span key={i} className="block my-2"><BlockMath math={part.slice(2, -2)} {...({ settings: { strict: false } } as any)} /></span>;
          } else if (part.startsWith('$') && part.endsWith('$')) {
            return <InlineMath key={i} math={part.slice(1, -1)} {...({ settings: { strict: false } } as any)} />;
          } else {
            return <span key={i}>{part}</span>;
          }
        } catch(e) {
          return <span key={i} className="text-rose-500">{part}</span>;
        }
      })}
    </span>
  );
};

export default function StudentAnalyticsClient({ submission }: { submission: any }) {
  const [analytics, setAnalytics] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (submission.analytics) {
      try {
        setAnalytics(JSON.parse(submission.analytics));
      } catch (e) {
        console.error("Failed to parse existing analytics", e);
      }
    }
  }, [submission]);



  return (
    <div className="max-w-4xl mx-auto w-full space-y-6">
      
      {/* Top Navigation */}
      <div className="flex justify-between items-center bg-white/60 backdrop-blur-md p-4 rounded-2xl border border-white shadow-sm shrink-0">
        <Link href={`/review?submissionId=${submission.id}`} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm text-sm">
          <ArrowLeft className="w-4 h-4" /> Back to Review Console
        </Link>
        <Link href={`/analytics?assignmentId=${submission.assignmentId}`} className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-bold transition-all hover:-translate-y-0.5 shadow-md text-sm">
          <BarChart2 className="w-4 h-4" /> View Class Analytics
        </Link>
      </div>

      {/* Main Card */}
      <div className="bg-white/80 backdrop-blur-md rounded-3xl border border-white shadow-xl overflow-hidden">
        {/* Banner */}
        <div className="bg-gradient-to-br from-indigo-900 via-indigo-850 to-slate-900 text-white p-8 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl pointer-events-none"></div>
          
          <div className="flex justify-between items-start relative z-10">
            <div>
              <span className="bg-indigo-500/30 border border-indigo-400/20 text-indigo-200 px-3 py-1 rounded-full text-xs font-black tracking-widest uppercase">
                Student Learning Profile
              </span>
              <h1 className="text-3xl font-black tracking-tight mt-3">{submission.student.name}</h1>
              <p className="text-slate-300 text-sm mt-1 font-semibold">Student ID: {submission.student.studentId} • {submission.assignment.title}</p>
            </div>
            <div className="text-right">
              <span className="text-xs text-indigo-300 font-bold block mb-1 uppercase">Assignment Score</span>
              <span className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">{submission.totalScore}%</span>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="p-8 space-y-8">
          {isGenerating && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
              <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Analyzing Homework Performance...</h3>
                <p className="text-slate-500 text-sm mt-1 max-w-sm">DeepSeek is pinpointing the student's mastery profile and unmastered concepts from their graded worksheet.</p>
              </div>
            </div>
          )}

          {error && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-6 text-center space-y-4">
              <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
              <div>
                <h3 className="font-bold text-rose-900 text-base">Analytics Not Generated</h3>
                <p className="text-rose-700 text-sm mt-1">{error}</p>
              </div>
            </div>
          )}

          {!analytics && !isGenerating && !error && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6 text-center space-y-4">
              <BookOpen className="w-10 h-10 text-indigo-500 mx-auto" />
              <div>
                <h3 className="font-bold text-indigo-900 text-base">Student Analytics Not Found</h3>
                <p className="text-indigo-700 text-sm mt-1">Please return to the Class Results view and click "Generate Class Analytics" to batch-process all student reports.</p>
              </div>
              <Link href={`/results?assignmentId=${submission.assignmentId}`} className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm px-5 py-2.5 rounded-xl shadow-md transition-all">
                Go to Class Results
              </Link>
            </div>
          )}

          {analytics && (
            <div className="space-y-8 animate-in fade-in duration-300">
              
              {/* Unmastered Concepts Section */}
              <div className="space-y-4">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  ⚠️ Unmastered Concepts / 未掌握知识点
                </h2>
                {analytics.unmasteredConcepts && analytics.unmasteredConcepts.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {analytics.unmasteredConcepts.map((item: any, idx: number) => (
                      <div key={idx} className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-5 hover:shadow-md transition-shadow border-l-4 border-l-amber-500">
                        <h4 className="font-extrabold text-amber-950 text-base">{item.concept}</h4>
                        <p className="text-amber-900 text-sm mt-2 leading-relaxed font-semibold">
                          <MathRenderer content={item.mistakeDescription} />
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 text-center text-emerald-800 font-bold text-sm">
                    Amazing! No major unmastered concepts identified for this worksheet. 🎉
                  </div>
                )}
              </div>



              {/* Suggestions Section */}
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50/50 border border-indigo-100 rounded-2xl p-6">
                <h3 className="font-extrabold text-indigo-950 flex items-center gap-2 text-base">
                  <BookOpen className="w-5 h-5 text-indigo-600" />
                  Study Suggestions / 学习建议
                </h3>
                <p className="text-indigo-900 text-sm mt-3 leading-relaxed font-semibold">
                  {analytics.suggestions}
                </p>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
