"use client";

import React, { useState, useRef, useEffect } from "react";
import { Upload, X, Loader2, CheckCircle2, FileStack, User, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";

interface Student {
  id?: string;
  studentId: string;
  name: string;
}

export default function UploadModal({ 
  assignmentId, 
  classId,
  students 
}: { 
  assignmentId: string; 
  classId: string;
  students: Student[] 
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"Single" | "Batch">("Single");
  const [mode, setMode] = useState<"SelectFile" | "Analyzing" | "Confirm">("SelectFile");
  
  // Single Upload States
  const [selectedStudent, setSelectedStudent] = useState(students[0]?.studentId || "");
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Batch Upload States
  const [tempFileName, setTempFileName] = useState("");
  const [matched, setMatched] = useState<{studentId: string, studentName: string, startPage: number, endPage: number}[]>([]);
  const [unmatched, setUnmatched] = useState<{startPage: number, endPage: number, assignedStudentId?: string}[]>([]);

  const [mounted, setMounted] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (file && file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    } else {
      setPreviewUrl(null);
    }
  }, [file]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!isOpen || mode !== "SelectFile") return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1 || items[i].type === "application/pdf") {
          const pastedFile = items[i].getAsFile();
          if (pastedFile) setFile(pastedFile);
          break;
        }
      }
    };
    if (isOpen) {
      window.addEventListener("paste", handlePaste);
    }
    return () => window.removeEventListener("paste", handlePaste);
  }, [isOpen, mode]);

  const resetModal = () => {
    setMode("SelectFile");
    setFile(null);
    setSuccess(false);
    setIsUploading(false);
    setMatched([]);
    setUnmatched([]);
  };

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(resetModal, 300);
  };

  const handleSingleUpload = async () => {
    if (!file || !selectedStudent || !assignmentId) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("assignmentId", assignmentId);
    formData.append("studentId", selectedStudent);

    try {
      const res = await fetch("/api/v1/assignments/upload", {
        method: "POST",
        body: formData
      });
      if (res.ok) {
        setSuccess(true);
        setTimeout(() => {
          handleClose();
          router.refresh();
        }, 1500);
      } else {
        alert("Upload failed. Please try again.");
      }
    } catch (err) {
      console.error(err);
      alert("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleBatchAnalyze = async () => {
    if (!file || !classId) return;
    setMode("Analyzing");
    
    const formData = new FormData();
    formData.append("file", file);
    formData.append("classId", classId);

    try {
      const res = await fetch("/api/v1/assignments/batch-analyze", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        setTempFileName(data.tempFileName);
        setMatched(data.matched);
        setUnmatched(data.unmatched);
        setMode("Confirm");
      } else {
        alert("Analysis failed: " + data.error);
        setMode("SelectFile");
      }
    } catch (err) {
      console.error(err);
      alert("Batch analysis failed.");
      setMode("SelectFile");
    }
  };

  const handleBatchConfirm = async () => {
    setIsUploading(true);
    
    // Combine matched and assigned unmatched
    const finalMapping = [
      ...matched,
      ...unmatched.filter(u => u.assignedStudentId).map(u => ({
        studentId: u.assignedStudentId,
        studentName: students.find(s => s.studentId === u.assignedStudentId)?.name || "Unknown",
        startPage: u.startPage,
        endPage: u.endPage
      }))
    ];

    try {
      const res = await fetch("/api/v1/assignments/batch-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignmentId,
          classId,
          tempFileName,
          finalMapping
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(true);
        setTimeout(() => {
          handleClose();
          router.refresh();
        }, 1500);
      } else {
        alert("Batch confirm failed: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Batch confirm failed.");
    } finally {
      setIsUploading(false);
    }
  };

  // Find students who have NOT been matched yet
  const missingStudents = students.filter(s => {
    const isMatched = matched.some(m => m.studentId === s.studentId);
    const isAssigned = unmatched.some(u => u.assignedStudentId === s.studentId);
    return !isMatched && !isAssigned;
  });

  const renderSelectFile = () => (
    <div className="space-y-5">
      <div className="flex bg-slate-100 p-1 rounded-xl">
        <button 
          onClick={() => { setActiveTab("Single"); setFile(null); }}
          className={`flex-1 py-2 font-bold text-sm rounded-lg transition-all ${activeTab === 'Single' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Single Student
        </button>
        <button 
          onClick={() => { setActiveTab("Batch"); setFile(null); }}
          className={`flex-1 py-2 font-bold text-sm rounded-lg transition-all ${activeTab === 'Batch' ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
        >
          Batch (Full Class PDF)
        </button>
      </div>

      {activeTab === "Single" && (
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">Select Student</label>
          <select 
            value={selectedStudent}
            onChange={(e) => setSelectedStudent(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
          >
            {students.map(s => (
              <option key={s.studentId} value={s.studentId}>{s.name} ({s.studentId})</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-bold text-slate-700 mb-2">
          {activeTab === "Single" ? "Homework File (Image or PDF)" : "Master Batch PDF"}
        </label>
        <div 
          className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${file ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300'}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept={activeTab === "Batch" ? "application/pdf" : "image/*,application/pdf"}
            onChange={(e) => e.target.files && setFile(e.target.files[0])}
          />
          {file ? (
            <div className="flex flex-col items-center gap-3">
              {previewUrl ? (
                <img src={previewUrl} alt="Preview" className="max-h-40 object-contain rounded-lg border border-slate-200 shadow-sm bg-white" />
              ) : (
                <div className="w-20 h-24 bg-indigo-100 rounded-lg border-2 border-indigo-200 flex items-center justify-center font-bold text-indigo-400">PDF</div>
              )}
              <div className="text-indigo-700 font-bold truncate max-w-[300px] text-center">{file.name}</div>
            </div>
          ) : (
            <div className="text-slate-500 text-sm flex flex-col items-center gap-2 py-4">
              {activeTab === "Batch" ? <FileStack className="w-8 h-8 text-slate-400 mb-2" /> : <Upload className="w-8 h-8 text-slate-400 mb-2" />}
              <span className="font-medium">
                {activeTab === "Batch" ? "Click to select a multi-page PDF" : "Click to select an image or PDF"}
              </span>
              <span className="opacity-70">(or press Ctrl+V to paste from clipboard)</span>
            </div>
          )}
        </div>
      </div>

      <button 
        onClick={activeTab === "Single" ? handleSingleUpload : handleBatchAnalyze}
        disabled={!file || isUploading}
        className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
      >
        {isUploading ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Uploading...</>
        ) : (
          activeTab === "Single" ? "Upload & Analyze" : "Analyze Batch PDF"
        )}
      </button>
    </div>
  );

  const renderAnalyzing = () => (
    <div className="py-12 flex flex-col items-center justify-center space-y-6 animate-in fade-in zoom-in duration-300">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-4 border-slate-100 absolute inset-0"></div>
        <div className="w-16 h-16 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin relative z-10"></div>
        <FileStack className="w-6 h-6 text-indigo-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
      </div>
      <div className="text-center">
        <h3 className="text-xl font-bold text-slate-800 mb-2">AI is scanning the document...</h3>
        <p className="text-slate-500 text-sm">Identifying student names and page boundaries.</p>
      </div>
    </div>
  );

  const renderConfirm = () => (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 flex gap-4">
        <div className="bg-white p-3 rounded-lg shadow-sm h-fit">
          <CheckCircle2 className="w-6 h-6 text-emerald-500" />
        </div>
        <div>
          <h3 className="font-bold text-indigo-900">Analysis Complete</h3>
          <p className="text-sm text-indigo-700 mt-1">Found {matched.length} matched submissions and {unmatched.length} unidentified page ranges.</p>
        </div>
      </div>

      <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
        {unmatched.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" /> Action Required ({unmatched.length})
            </h4>
            {unmatched.map((u, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="font-medium text-amber-800 text-sm">
                  Pages {u.startPage} - {u.endPage}
                </div>
                <select
                  className="bg-white border border-amber-200 text-sm rounded-md px-2 py-1 outline-none font-medium"
                  value={u.assignedStudentId || ""}
                  onChange={(e) => {
                    const newUnmatched = [...unmatched];
                    newUnmatched[i].assignedStudentId = e.target.value;
                    setUnmatched(newUnmatched);
                  }}
                >
                  <option value="">-- Assign to Missing Student --</option>
                  {missingStudents.map(ms => (
                    <option key={ms.studentId} value={ms.studentId}>{ms.name}</option>
                  ))}
                  {/* Keep already assigned ones in the list if the user changes their mind */}
                  {u.assignedStudentId && !missingStudents.find(s => s.studentId === u.assignedStudentId) && (
                    <option value={u.assignedStudentId}>{students.find(s => s.studentId === u.assignedStudentId)?.name}</option>
                  )}
                </select>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2">
          <h4 className="font-bold text-slate-700 text-sm uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Matched ({matched.length})
          </h4>
          {matched.map((m, i) => (
            <div key={i} className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <div className="flex items-center gap-3">
                <div className="bg-slate-200 p-1.5 rounded-full"><User className="w-4 h-4 text-slate-600" /></div>
                <div>
                  <div className="font-bold text-sm text-slate-800">{m.studentName}</div>
                  <div className="text-xs text-slate-500">ID: {m.studentId}</div>
                </div>
              </div>
              <div className="text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                Pg {m.startPage}{m.endPage > m.startPage ? `-${m.endPage}` : ''}
              </div>
            </div>
          ))}
        </div>
      </div>

      <button 
        onClick={handleBatchConfirm}
        disabled={isUploading || success}
        className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
      >
        {isUploading ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Splitting PDF & Creating Submissions...</>
        ) : success ? (
          <><CheckCircle2 className="w-5 h-5" /> Done!</>
        ) : (
          "Confirm & Split Batch"
        )}
      </button>
    </div>
  );

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl p-6 w-[560px] max-w-full relative">
        <button 
          onClick={handleClose} 
          disabled={isUploading}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 p-2.5 rounded-full transition-colors shadow-sm z-10 disabled:opacity-50"
        >
          <X className="w-5 h-5" />
        </button>
        
        <h2 className="text-2xl font-black text-slate-800 mb-6">
          {mode === "SelectFile" && "Upload Homework"}
          {mode === "Analyzing" && "Analyzing Batch..."}
          {mode === "Confirm" && "Confirm Batch Assignment"}
        </h2>
        
        {mode === "SelectFile" && renderSelectFile()}
        {mode === "Analyzing" && renderAnalyzing()}
        {mode === "Confirm" && renderConfirm()}
      </div>
    </div>
  );

  return (
    <>
      <button 
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-slate-900 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-slate-900/20 hover:bg-indigo-600 hover:-translate-y-0.5 hover:shadow-indigo-500/30 transition-all"
      >
        <Upload className="w-4 h-4" />
        Upload Slice
      </button>
      {mounted && isOpen && createPortal(modalContent, document.body)}
    </>
  );
}
