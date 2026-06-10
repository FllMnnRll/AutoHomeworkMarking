"use client";

import { useState } from "react";
import Link from "next/link";
import { PlusCircle, History, Users } from "lucide-react";
import CreateAssignmentWizard from "@/components/CreateAssignmentWizard";

export default function Home() {
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div className="flex flex-col items-center justify-center min-h-[85vh] text-center px-4 bg-slate-50">
      <div className="max-w-3xl w-full">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-800 mb-4">
          Grading Console
        </h1>
        <p className="text-lg text-slate-500 mb-12 font-medium">
          Select an operation to continue
        </p>
        
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <button 
            onClick={() => setShowWizard(true)}
            className="group flex flex-col items-center justify-center gap-4 p-8 bg-white border-2 border-slate-200 rounded-3xl shadow-sm hover:border-indigo-600 hover:shadow-md transition-all duration-300"
          >
            <PlusCircle className="w-12 h-12 text-indigo-600" />
            <span className="font-bold text-lg text-slate-800 group-hover:text-indigo-600 transition-colors">新建批改流程<br/><span className="text-sm font-medium text-slate-400">New Task</span></span>
          </button>

          <Link 
            href="/results" 
            className="group flex flex-col items-center justify-center gap-4 p-8 bg-white border-2 border-slate-200 rounded-3xl shadow-sm hover:border-indigo-600 hover:shadow-md transition-all duration-300"
          >
            <History className="w-12 h-12 text-indigo-600" />
            <span className="font-bold text-lg text-slate-800 group-hover:text-indigo-600 transition-colors">历史作业批改<br/><span className="text-sm font-medium text-slate-400">History</span></span>
          </Link>

          <Link 
            href="/classes" 
            className="group flex flex-col items-center justify-center gap-4 p-8 bg-white border-2 border-slate-200 rounded-3xl shadow-sm hover:border-indigo-600 hover:shadow-md transition-all duration-300"
          >
            <Users className="w-12 h-12 text-indigo-600" />
            <span className="font-bold text-lg text-slate-800 group-hover:text-indigo-600 transition-colors">班级管理<br/><span className="text-sm font-medium text-slate-400">Manage Classes</span></span>
          </Link>
        </div>
      </div>

      {showWizard && <CreateAssignmentWizard onClose={() => setShowWizard(false)} />}
    </div>
  );
}
