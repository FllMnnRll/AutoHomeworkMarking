"use client";

import React, { useState } from "react";
import { Trash2, Edit2, Loader2, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AssignmentActions({ assignmentId, currentTitle }: { assignmentId: string, currentTitle: string }) {
  const [isEditing, setIsEditing] = useState(false);
  const [newTitle, setNewTitle] = useState(currentTitle);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this assignment and all its submissions?")) return;
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/assignments/delete?id=${assignmentId}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/results");
        router.refresh();
      } else {
        alert("Failed to delete assignment");
      }
    } catch (e) {
      alert("Error deleting assignment");
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!newTitle.trim() || newTitle === currentTitle) {
      setIsEditing(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch(`/api/v1/assignments/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: assignmentId, title: newTitle })
      });
      if (res.ok) {
        setIsEditing(false);
        router.refresh();
      } else {
        alert("Failed to edit assignment");
      }
    } catch (e) {
      alert("Error editing assignment");
    } finally {
      setIsLoading(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-2 mt-2">
        <input 
          type="text" 
          value={newTitle} 
          onChange={e => setNewTitle(e.target.value)}
          className="px-2 py-1 text-sm border border-indigo-200 rounded-md focus:outline-none focus:border-indigo-500 font-bold text-indigo-900"
          autoFocus
          onKeyDown={e => {
            if (e.key === "Enter") handleEdit();
            if (e.key === "Escape") { setIsEditing(false); setNewTitle(currentTitle); }
          }}
        />
        <button onClick={handleEdit} disabled={isLoading} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors">
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button onClick={() => { setIsEditing(false); setNewTitle(currentTitle); }} disabled={isLoading} className="p-1 text-slate-400 hover:bg-slate-50 rounded-md transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 ml-4">
      <button 
        onClick={() => setIsEditing(true)} 
        disabled={isLoading}
        title="Edit Name"
        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
      >
        <Edit2 className="w-4 h-4" />
      </button>
      <button 
        onClick={handleDelete} 
        disabled={isLoading}
        title="Delete Assignment"
        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
      >
        {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
      </button>
    </div>
  );
}
