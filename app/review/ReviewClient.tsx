"use client";

import React, { useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, MessageSquarePlus, ScanText, Target, BarChart2, Loader2 } from "lucide-react";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import Image from 'next/image';

const MathRenderer = ({ content, forceMath = false }: { content: string, forceMath?: boolean }) => {
  if (!content) return null;
  // If it's forced to be math and doesn't contain explicit $ delimiters, render as pure math
  if (forceMath && !content.includes('$')) {
    try {
      return <InlineMath math={content} {...({ settings: { strict: false } } as any)} />;
    } catch(e) {
      return <span>{content}</span>;
    }
  }
  // Otherwise parse mixed text and math delimiters
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
          // Fallback if katex fails to parse
          return <span key={i} className="text-red-500">{part}</span>;
        }
      })}
    </span>
  );
};

// We pass the fetched data as props
export default function ReviewClient({ submission, activeSlice, otherSubmissions }: any) {
  const defaultScore = activeSlice?.aiScore || 0;
  const [score, setScore] = useState(defaultScore);
  const [isZoomed, setIsZoomed] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const router = useRouter();

  // Parse reasoning tree securely
  let reasoningTree = [];
  try {
    if (activeSlice?.reasoningTree) {
      reasoningTree = JSON.parse(activeSlice.reasoningTree);
    }
  } catch(e) {}

  const isPdf = activeSlice?.rawImagePath?.toLowerCase().endsWith('.pdf');

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      const res = await fetch("/api/v1/submissions/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: submission.id,
          finalScore: score
        })
      });
      if (res.ok) {
        // Automatically redirect to the next pending review, or back to results
        const nextSub = otherSubmissions.find((s: any) => s.needsReview && s.id !== submission.id);
        if (nextSub) {
          router.push(`/review?submissionId=${nextSub.id}`);
        } else {
          router.push(`/results`);
        }
      } else {
        alert("Failed to confirm. Please try again.");
      }
    } catch (e) {
      alert("Error connecting to server.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] min-h-[700px] w-full gap-4 max-w-[1800px] mx-auto z-0 relative">
      
      {/* Header Info */}
      <div className="flex justify-between items-center bg-white/60 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-white z-10 shrink-0">
        <div>
          <div className="mb-2">
            <Link href="/" className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/80 border border-slate-200 rounded-lg font-bold text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm text-xs">
              <span className="text-sm leading-none">&larr;</span> Home / 导航页
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Reviewing:</h1>
            <select 
              className="bg-white/80 border border-slate-300 text-slate-800 text-base font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block px-3 py-1.5 shadow-sm cursor-pointer outline-none hover:bg-slate-50 transition-colors"
              defaultValue={submission?.id}
              onChange={(e) => window.location.href = `/review?submissionId=${e.target.value}`}
            >
              {otherSubmissions.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.student.name} ({s.student.studentId}) {s.needsReview ? '⚠️' : ''}
                </option>
              ))}
            </select>
          </div>
          <p className="text-indigo-600 font-bold mt-2 text-xs flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span> {activeSlice?.questionName || 'Question Slice'}
          </p>
        </div>
        <div className="flex gap-4 items-center">
          {submission?.needsReview && (
            <div className="bg-amber-100 text-amber-800 px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
              </span>
              Needs Manual Review
            </div>
          )}
        </div>
      </div>

      {/* Main Split Content - 3 Columns */}
      <div className="flex-1 grid grid-cols-12 gap-4 min-h-0 z-0">
        
        {/* Col 1: Raw Image */}
        <div className="col-span-4 flex flex-col bg-white/80 backdrop-blur-md rounded-3xl shadow-xl shadow-indigo-100/40 border border-white/60 overflow-hidden min-h-0">
          <div className="p-4 border-b border-indigo-50/50 bg-white/50 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <ScanText className="w-5 h-5 text-indigo-500" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Raw Submission Slice</h2>
            </div>
            <button onClick={() => setIsZoomed(true)} className="text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm">
              Click to Zoom
            </button>
          </div>
          <div className="flex-1 bg-slate-100 relative overflow-hidden min-h-[400px]">
            <div 
              className={`absolute inset-4 rounded-xl overflow-hidden shadow-inner border border-slate-200/50 bg-white z-0 group ${!isPdf && 'cursor-zoom-in'}`}
              onClick={() => !isPdf && setIsZoomed(true)}
            >
              {activeSlice?.rawImagePath ? (
                isPdf ? (
                  <embed 
                    src={activeSlice.rawImagePath} 
                    type="application/pdf" 
                    className="w-full h-full"
                  />
                ) : (
                  <Image 
                    src={activeSlice.rawImagePath} 
                    alt="Student handwritten physics calculation" 
                    fill
                    className="object-contain transition-transform duration-300 group-hover:scale-105"
                    priority
                  />
                )
              ) : (
                <div className="flex items-center justify-center w-full h-full text-slate-400 font-medium">No image available</div>
              )}
            </div>
          </div>
        </div>

        {/* Col 2: OCR Text */}
        <div className="col-span-4 flex flex-col bg-white/80 backdrop-blur-md rounded-3xl shadow-xl shadow-indigo-100/40 border border-white/60 overflow-hidden min-h-0">
          <div className="p-4 border-b border-indigo-50/50 bg-white/50 flex items-center gap-2 shrink-0">
            <Target className="w-5 h-5 text-indigo-500" />
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">AI Vision Extraction (OCR)</h2>
          </div>
          <div className="flex-1 p-6 bg-slate-50/50 overflow-y-auto">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 font-serif text-lg text-slate-700 leading-relaxed">
              {activeSlice?.ocrText ? (
                <MathRenderer content={activeSlice.ocrText} />
              ) : (
                <div className="text-center text-slate-400 font-medium text-sm">Waiting for OCR Processing...</div>
              )}
            </div>
          </div>
        </div>

        {/* Col 3: Reasoning + Grading */}
        <div className="col-span-4 bg-white/80 backdrop-blur-md rounded-3xl shadow-xl shadow-indigo-100/40 border border-white/60 flex flex-col overflow-hidden min-h-0">
          <div className="p-4 border-b border-indigo-50/50 bg-white/50 flex justify-between items-center shrink-0">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              ✨ Logic Tree
            </h2>
            <div className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full shadow-sm border border-indigo-100">
              AI Suggests: {activeSlice?.aiScore}%
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            
            {reasoningTree.map((node: any, idx: number) => (
              <div key={idx} className={`border rounded-2xl p-4 hover:shadow-md transition-shadow ${
                node.status === 'error' ? 'bg-red-50 border-red-200 border-l-4 border-l-red-500' :
                node.status === 'ecf' ? 'bg-amber-50 border-amber-200' :
                'bg-emerald-50 border-emerald-200'
              }`}>
                <div className="flex items-start gap-3">
                  {node.status === 'error' ? <XCircle className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" /> :
                   node.status === 'ecf' ? <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" /> :
                   <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 flex-shrink-0" />}
                  <div className="w-full">
                    <div className="flex justify-between items-center w-full">
                      <h4 className={`text-sm font-bold ${
                        node.status === 'error' ? 'text-red-900' :
                        node.status === 'ecf' ? 'text-amber-900' :
                        'text-emerald-900'
                      }`}>Question {node.questionNumber} - {node.type}</h4>
                      <div className={`text-xs font-black px-2 py-1 rounded ${
                        node.status === 'error' ? 'text-red-700 bg-red-100/50' :
                        node.status === 'ecf' ? 'text-amber-700 bg-amber-100/50' :
                        'text-emerald-700 bg-emerald-100/50'
                      }`}>{node.pointsAwarded || node.points}</div>
                    </div>
                    
                    <div className={`text-xs mt-3 leading-relaxed space-y-2 ${
                      node.status === 'error' ? 'text-red-800' :
                      node.status === 'ecf' ? 'text-amber-800' :
                      'text-emerald-800'
                    }`}>
                      {node.ocrQuestionText && (
                        <div className="bg-white/40 p-2 rounded-lg border border-white/50">
                          <span className="font-bold block mb-1 opacity-70">Question Text:</span>
                          <MathRenderer content={node.ocrQuestionText} forceMath />
                        </div>
                      )}
                      {node.ocrStudentWork && (
                        <div className="bg-white/40 p-2 rounded-lg border border-white/50">
                          <span className="font-bold block mb-1 opacity-70">Student Work:</span>
                          <MathRenderer content={node.ocrStudentWork} forceMath />
                        </div>
                      )}
                      {(node.gradingLogic || node.message) && (
                        <div className="bg-white/60 p-2 rounded-lg shadow-sm border border-white">
                          <span className="font-bold block mb-1 opacity-70">AI Reasoning:</span>
                          <MathRenderer content={node.gradingLogic || node.message} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {reasoningTree.length === 0 && (
              <div className="text-center text-slate-400 font-medium py-10">AI Logic Tree is still generating...</div>
            )}

          </div>

          {/* Speed Grading Tool */}
          <div className="p-4 border-t border-slate-100/60 bg-white/60 backdrop-blur-md shrink-0">
            <div className="mb-4">
              <label className="text-xs font-bold text-slate-700 block mb-2 uppercase tracking-wider">Final Score Adjustment</label>
              <input type="range" min="0" max="100" value={score} onChange={(e) => setScore(parseInt(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
              <div className="flex justify-between text-xs font-semibold text-slate-500 mt-2">
                <span>0%</span>
                <span className="text-indigo-600 font-black bg-indigo-50 px-2 py-1 rounded-md shadow-sm border border-indigo-100">Final Awarded: {score}%</span>
                <span>100%</span>
              </div>
            </div>
            
            <div className="flex gap-2 mt-4">
              <button 
                onClick={handleConfirm}
                disabled={isConfirming}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:from-slate-400 disabled:to-slate-500 text-white rounded-xl py-2.5 text-sm font-black shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
              >
                {isConfirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquarePlus className="w-4 h-4" />}
                {isConfirming ? 'Saving...' : 'Confirm & Save'}
              </button>
              
              <Link href={`/analytics?submissionId=${submission.id}`} className="bg-slate-100 text-slate-700 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold shadow-sm hover:bg-slate-200 hover:text-indigo-700 transition-all flex items-center justify-center gap-2 group">
                <BarChart2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                Analytics
              </Link>
            </div>
          </div>

        </div>
      </div>

      {/* Fullscreen Zoom Modal */}
      {isZoomed && activeSlice?.rawImagePath && !isPdf && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm" onClick={() => setIsZoomed(false)}>
          <div className="relative w-11/12 h-[90%] max-w-6xl bg-white rounded-2xl p-4 cursor-zoom-out shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="absolute top-4 right-4 z-10 bg-white/80 backdrop-blur rounded-full p-2 hover:bg-slate-100 text-slate-700">
              <XCircle className="w-8 h-8" />
            </div>
            <Image 
              src={activeSlice.rawImagePath} 
              alt="Zoomed Student handwriting" 
              fill
              className="object-contain p-4"
              priority
            />
          </div>
        </div>
      )}
    </div>
  );
}
