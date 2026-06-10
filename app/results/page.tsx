import React from 'react';
import Link from 'next/link';
import { Search, CheckCircle2, AlertTriangle, FileText, Layers } from 'lucide-react';
import { parseProcessingMeta } from '@/lib/pdfChunking';
import { PrismaClient } from '@prisma/client';
import UploadModal from './UploadModal';
import RetryButton from './RetryButton';
import GenerateAnalyticsButton from './GenerateAnalyticsButton';
import AnalyticsProgressBar from './AnalyticsProgressBar';

import AssignmentActions from './AssignmentActions';
import GradingController from './GradingController';

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export default async function ResultsPage({ searchParams }: { searchParams: Promise<{ assignmentId?: string }> }) {
  const params = await searchParams;
  
  // Fetch assignments for the dropdown
  const assignments = await prisma.assignment.findMany({
    orderBy: { date: 'desc' }
  });

  // By default, display the requested assignment or the latest assignment
  const activeAssignment = params.assignmentId 
    ? assignments.find(a => a.id === params.assignmentId) || assignments[0]
    : assignments[0];

  // Fetch submissions for this assignment
  const submissions = await prisma.submission.findMany({
    where: { assignmentId: activeAssignment?.id },
    include: { student: true }
  });

  // Fetch class analytics status
  const classAnalytics = activeAssignment
    ? await prisma.classAnalytics.findUnique({ where: { assignmentId: activeAssignment.id } })
    : null;
  const analyticsStatus = classAnalytics ? classAnalytics.status : "None";

  // Fetch all students for the upload dropdown
  const allStudents = await prisma.student.findMany();
  const classStudents = activeAssignment ? allStudents.filter(s => s.classId === activeAssignment.classId) : [];

  const isAnyProcessing = submissions.some(sub => sub.status === 'Processing OCR' || sub.status === 'Queued');
  const totalSubmissions = submissions.length;
  const completedSubmissions = submissions.filter(sub => sub.status !== 'Processing OCR' && sub.status !== 'Queued').length;
  const progressPercent = totalSubmissions > 0 ? Math.round((completedSubmissions / totalSubmissions) * 100) : 0;

  const isAnalyticsGenerating = analyticsStatus === "Generating";
  const keepPolling = isAnyProcessing || isAnalyticsGenerating;

  return (
    <div className="max-w-6xl mx-auto w-full space-y-6">
      <GradingController 
        assignmentId={activeAssignment?.id}
        pendingCount={submissions.filter(sub => sub.status === 'Processing OCR' || sub.status === 'Queued').length}
        completedCount={completedSubmissions}
        totalCount={totalSubmissions}
        isAnalyticsGenerating={isAnalyticsGenerating}
      />
      <div className="flex justify-between items-end bg-white/60 backdrop-blur-md p-6 rounded-3xl shadow-sm border border-white">
        <div>
          <div className="mb-4">
            <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 border border-slate-200 rounded-xl font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm text-sm">
              <span className="text-lg leading-none">&larr;</span> Home / 导航页
            </Link>
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-indigo-900 to-slate-700">Class Results</h1>
          <div className="mt-3 flex items-center">
            <span className="w-2 h-2 rounded-full bg-indigo-500 mr-3"></span>
            <select 
              className="bg-white/80 border border-indigo-100 text-indigo-700 text-sm font-bold rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 block px-3 py-1.5 shadow-sm cursor-pointer outline-none hover:bg-indigo-50 transition-colors"
              defaultValue={activeAssignment?.id}
            >
              {assignments.map(a => (
                <option key={a.id} value={a.id}>{a.title} • {new Date(a.date).toLocaleString()}</option>
              ))}
            </select>
            {activeAssignment && (
              <AssignmentActions assignmentId={activeAssignment.id} currentTitle={activeAssignment.title} />
            )}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text" 
              placeholder="Search students..." 
              className="pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-64 text-sm font-medium"
            />
          </div>
          {activeAssignment && (
            <div className="flex items-center gap-3">
              <GenerateAnalyticsButton 
                assignmentId={activeAssignment.id} 
                isEnabled={completedSubmissions > 0} 
              />
              <UploadModal assignmentId={activeAssignment.id} classId={activeAssignment.classId} students={classStudents} />
            </div>
          )}
        </div>
      </div>



      {isAnalyticsGenerating && (
        <AnalyticsProgressBar />
      )}

      <div className="bg-white/80 backdrop-blur-md rounded-3xl shadow-xl shadow-indigo-100/40 border border-white/60 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200 text-sm font-bold text-slate-500">
              <th className="py-4 px-6">Student ID</th>
              <th className="py-4 px-6">Name</th>
              <th className="py-4 px-6">AI Score</th>
              <th className="py-4 px-6">Status</th>
              <th className="py-4 px-6 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {classStudents.map((student) => {
              const sub = submissions.find(s => s.studentId === student.id);
              if (sub) {
                return (
                  <tr key={sub.id} className="border-b border-slate-100 last:border-0 hover:bg-indigo-50/30 transition-colors">
                    <td className="py-4 px-6 font-medium text-slate-700">{sub.student.studentId}</td>
                    <td className="py-4 px-6 font-bold text-slate-900">{sub.student.name}</td>
                    <td className="py-4 px-6">
                      <span className={`font-black ${sub.status === 'Processing OCR' || sub.status === 'Queued' || sub.totalScore === null ? 'text-slate-400' : (sub.totalScore < 60 ? 'text-amber-600' : 'text-emerald-600')}`}>
                        {sub.totalScore !== null ? `${sub.totalScore}%` : 'Pending'}
                      </span>
                    </td>
                    <td className="py-4 px-6">
                      {sub.status === 'Error during OCR' ? (
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-100 text-rose-800 text-xs font-bold w-fit">
                            <AlertTriangle className="w-3.5 h-3.5" /> AI Error
                          </span>
                          {sub.errorMessage && <span className="text-[10px] text-rose-600 font-semibold max-w-[200px] leading-tight" title={sub.errorMessage}>{sub.errorMessage}</span>}
                        </div>
                      ) : sub.needsReview ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-bold">
                          <AlertTriangle className="w-3.5 h-3.5" /> Needs Review
                        </span>
                      ) : sub.status === 'Processing OCR' ? (
                        (() => {
                          const meta = parseProcessingMeta(sub.processingMeta);
                          if (meta?.pdfChunked) {
                            return (
                              <div className="flex flex-col gap-1">
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-bold w-fit">
                                  <Layers className="w-3.5 h-3.5" /> Chunk {meta.completedChunks}/{meta.totalChunks}
                                </span>
                                <span className="text-[10px] text-amber-600 font-semibold max-w-[200px] leading-tight" title={meta.message}>
                                  {meta.phase}: {meta.message}
                                </span>
                              </div>
                            );
                          }
                          return (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-600 text-xs font-bold">
                              <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse"></div> Processing
                            </span>
                          );
                        })()
                      ) : sub.status === 'Queued' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-500 text-xs font-bold">
                          <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div> Queued
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Graded
                        </span>
                      )}
                    </td>
                    <td className="py-4 px-6 text-right">
                      {sub.status === 'Error during OCR' ? (
                        <RetryButton submissionId={sub.id} />
                      ) : (
                        <Link 
                          href={`/review?submissionId=${sub.id}`} 
                          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all hover:-translate-y-0.5 ${
                            sub.needsReview ? 'bg-indigo-600 text-white shadow-indigo-500/30 hover:bg-indigo-700 hover:shadow-indigo-500/50' : 'bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200'
                          }`}
                        >
                          <FileText className="w-4 h-4" />
                          Review
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              } else {
                return (
                  <tr key={student.id} className="border-b border-slate-100 last:border-0 opacity-60 hover:bg-slate-50/50 transition-colors">
                    <td className="py-4 px-6 font-medium text-slate-500">{student.studentId}</td>
                    <td className="py-4 px-6 font-bold text-slate-600">{student.name}</td>
                    <td className="py-4 px-6 text-slate-400 font-bold">-</td>
                    <td className="py-4 px-6">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-rose-50 text-rose-600 text-xs font-bold">
                        未交作业
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right">
                      <button disabled className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-slate-100 text-slate-400 cursor-not-allowed">
                        <FileText className="w-4 h-4" />
                        Review
                      </button>
                    </td>
                  </tr>
                );
              }
            })}
            {classStudents.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">
                  No students found in this class.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
