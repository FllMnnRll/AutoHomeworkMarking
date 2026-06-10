"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { XCircle, ChevronRight, ChevronLeft, CheckCircle2, UploadCloud, Mail, Sparkles, BookOpen } from "lucide-react";

export default function CreateAssignmentWizard({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  
  const [config, setConfig] = useState({
    classId: "",
    title: "",
    uploadMethod: "",
    aiMode: "",
    subject: "",
    evaluationType: "Homework",
    gradingDepth: "Fast"
  });

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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
    const fetchClasses = async () => {
      try {
        const res = await fetch("/api/v1/classes");
        const data = await res.json();
        if (data.success) {
          setClasses(data.classes);
        }
      } catch (e) {
        console.error("Failed to fetch classes", e);
      }
    };
    fetchClasses();
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (step !== 4 || config.aiMode !== "AnswerKey") return;
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
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [step, config.aiMode]);

  const handleNext = () => setStep(prev => prev + 1);
  const handleBack = () => setStep(prev => prev - 1);

  const handleComplete = async () => {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("classId", config.classId);
      formData.append("title", config.title);
      formData.append("uploadMethod", config.uploadMethod);
      formData.append("aiMode", config.aiMode);
      formData.append("subject", config.subject);
      formData.append("evaluationType", config.evaluationType);
      formData.append("gradingDepth", config.gradingDepth);
      if (config.aiMode === "AnswerKey" && file) {
        formData.append("file", file);
      }

      const res = await fetch("/api/v1/assignments/create", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        if (config.uploadMethod === "Email") {
          fetch("/api/v1/email/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assignmentId: data.assignment.id })
          }).catch(console.error);
        }
        router.push("/results");
        onClose();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl p-8 animate-in fade-in zoom-in duration-200">
        <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors">
          <XCircle className="w-7 h-7" />
        </button>

        <div className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <div className={`h-2 flex-1 rounded-full ${step >= 1 ? 'bg-indigo-600' : 'bg-slate-100'}`} />
            <div className={`h-2 flex-1 rounded-full ${step >= 2 ? 'bg-indigo-600' : 'bg-slate-100'}`} />
            <div className={`h-2 flex-1 rounded-full ${step >= 3 ? 'bg-indigo-600' : 'bg-slate-100'}`} />
            <div className={`h-2 flex-1 rounded-full ${step >= 4 ? 'bg-indigo-600' : 'bg-slate-100'}`} />
            <div className={`h-2 flex-1 rounded-full ${step >= 5 ? 'bg-indigo-600' : 'bg-slate-100'}`} />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800">
            {step === 1 && "Step 1: Select Class"}
            {step === 2 && "Step 2: Task Name"}
            {step === 3 && "Step 3: Upload Source"}
            {step === 4 && "Step 4: AI Mode"}
            {step === 5 && "Step 5: Subject Engine"}
          </h2>
        </div>

        <div className="min-h-[250px] flex flex-col justify-center">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-medium">Which class is this assignment for?</p>
              <select 
                className="w-full p-4 rounded-xl border-2 border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white transition-all text-lg font-medium outline-none"
                value={config.classId}
                onChange={(e) => setConfig({...config, classId: e.target.value})}
              >
                <option value="" disabled>-- Select a class --</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {classes.length === 0 && (
                <p className="text-sm text-amber-600 mt-2">No classes found. Please create a class in Class Management first.</p>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-medium">Give this grading task a name. (Leave blank to auto-generate)</p>
              <input 
                type="text"
                placeholder="e.g. Chapter 4 Limits Quiz"
                className="w-full p-4 rounded-xl border-2 border-slate-200 bg-slate-50 focus:border-indigo-500 focus:bg-white transition-all text-lg font-medium outline-none"
                value={config.title}
                onChange={(e) => setConfig({...config, title: e.target.value})}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-medium">How will you ingest the student papers?</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setConfig({...config, uploadMethod: 'Email'})}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${config.uploadMethod === 'Email' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 text-slate-600'}`}
                >
                  <Mail className="w-10 h-10" />
                  <span className="font-bold text-lg">Scan Printer Email</span>
                </button>
                <button 
                  onClick={() => setConfig({...config, uploadMethod: 'Manual'})}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${config.uploadMethod === 'Manual' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 text-slate-600'}`}
                >
                  <UploadCloud className="w-10 h-10" />
                  <span className="font-bold text-lg">Manual Upload</span>
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-medium">Choose the grading intelligence mode.</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setConfig({...config, aiMode: 'Auto'})}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${config.aiMode === 'Auto' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 text-slate-600'}`}
                >
                  <Sparkles className="w-10 h-10" />
                  <span className="font-bold text-lg">Auto AI Logic</span>
                  <span className="text-sm opacity-70 text-center">AI deduces correct steps automatically</span>
                </button>
                <button 
                  onClick={() => setConfig({...config, aiMode: 'AnswerKey'})}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${config.aiMode === 'AnswerKey' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 text-slate-600'}`}
                >
                  <CheckCircle2 className="w-10 h-10" />
                  <span className="font-bold text-lg">Standard Answer Key</span>
                  <span className="text-sm opacity-70 text-center">Compare against teacher's rubric</span>
                </button>
              </div>
              {config.aiMode === 'AnswerKey' && (
                <div className="space-y-4 animate-in slide-in-from-top duration-200">
                  <div className="mt-4 p-4 rounded-xl border border-dashed border-indigo-300 bg-indigo-50 flex flex-col items-center gap-2">
                    <input type="file" accept="image/*,application/pdf" className="text-sm text-indigo-700 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-700" onChange={(e) => setFile(e.target.files?.[0] || null)} />
                    {previewUrl && (
                      <img src={previewUrl} alt="Preview" className="mt-2 max-h-40 object-contain rounded-lg border border-slate-200 shadow-sm bg-white" />
                    )}
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider mt-2">
                      {file ? `Selected: ${file.name}` : "Or press Ctrl+V to paste an image here"}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Evaluation Mode (评测类型)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setConfig({...config, evaluationType: 'Homework'})}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${config.evaluationType === 'Homework' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
                      >
                        <span className="font-bold text-sm">Homework Mode (极速作业)</span>
                        <span className="text-[10px] opacity-75 text-center leading-normal">Grades final answers only, skips detailed steps, super-fast & saves tokens</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig({...config, evaluationType: 'Exam'})}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${config.evaluationType === 'Exam' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
                      >
                        <span className="font-bold text-sm">Exam Mode (严谨考试)</span>
                        <span className="text-[10px] opacity-75 text-center leading-normal">Meticulously grades all steps, formulas & partial credit rubrics</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {config.aiMode === 'Auto' && (
                <div className="space-y-4 animate-in slide-in-from-top duration-200 mt-4">
                  <div className="space-y-2">
                    <label className="block text-sm font-bold text-slate-700">Grading Depth (批改深度)</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setConfig({...config, gradingDepth: 'Fast'})}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${config.gradingDepth === 'Fast' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
                      >
                        <span className="font-bold text-sm">Fast Mode (急速批改)</span>
                        <span className="text-[10px] opacity-75 text-center leading-normal">Generates Master Key, then grades only final answers for maximum efficiency. 0 points for wrong answers.</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfig({...config, gradingDepth: 'Reasoning'})}
                        className={`p-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-all ${config.gradingDepth === 'Reasoning' ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 shadow-sm' : 'border-slate-100 hover:border-slate-200 text-slate-500'}`}
                      >
                        <span className="font-bold text-sm">Reasoning Mode (深度推理)</span>
                        <span className="text-[10px] opacity-75 text-center leading-normal">AI evaluates step-by-step logic, gives partial credit & Error Carried Forward.</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 5 && (
            <div className="space-y-4">
              <p className="text-slate-500 font-medium">Select the target Subject Engine for OCR optimization.</p>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => setConfig({...config, subject: 'AP Calculus'})}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${config.subject === 'AP Calculus' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 text-slate-600'}`}
                >
                  <span className="text-4xl font-black">∫</span>
                  <span className="font-bold text-lg">AP Calculus</span>
                </button>
                <button 
                  onClick={() => setConfig({...config, subject: 'AP Physics'})}
                  className={`p-6 rounded-2xl border-2 flex flex-col items-center gap-3 transition-all ${config.subject === 'AP Physics' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 hover:border-indigo-300 text-slate-600'}`}
                >
                  <span className="text-4xl font-black">ΣF</span>
                  <span className="font-bold text-lg">AP Physics</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between mt-10 pt-6 border-t border-slate-100">
          {step > 1 ? (
            <button onClick={handleBack} className="px-6 py-3 font-bold text-slate-500 hover:bg-slate-100 rounded-xl transition-colors flex items-center gap-2">
              <ChevronLeft className="w-5 h-5" /> Back
            </button>
          ) : <div></div>}
          
          {step < 5 ? (
            <button 
              onClick={handleNext} 
              disabled={(step===1 && !config.classId) || (step===3 && !config.uploadMethod) || (step===4 && !config.aiMode)}
              className="px-8 py-3 font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              Continue <ChevronRight className="w-5 h-5" />
            </button>
          ) : (
            <button 
              onClick={handleComplete} 
              disabled={!config.subject || loading}
              className="px-8 py-3 font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-2"
            >
              {loading ? "Creating..." : "Finish & Launch"} <Sparkles className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
