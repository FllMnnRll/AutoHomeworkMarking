"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, Trash2, Edit2, Users, Save, X } from "lucide-react";

export default function ClassesPage() {
  const [classes, setClasses] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [activeClass, setActiveClass] = useState<string | null>(null);
  
  const [newClassName, setNewClassName] = useState("");
  const [newStudent, setNewStudent] = useState({ studentId: "", name: "" });
  const [editingStudent, setEditingStudent] = useState<any>(null);

  useEffect(() => {
    fetchClasses();
  }, []);

  useEffect(() => {
    if (activeClass) fetchStudents(activeClass);
    else setStudents([]);
  }, [activeClass]);

  const fetchClasses = async () => {
    const res = await fetch("/api/v1/classes");
    const data = await res.json();
    if (data.success) {
      setClasses(data.classes);
      if (data.classes.length > 0 && !activeClass) {
        setActiveClass(data.classes[0].id);
      }
    }
  };

  const fetchStudents = async (classId: string) => {
    const res = await fetch(`/api/v1/students?classId=${classId}`);
    const data = await res.json();
    if (data.success) setStudents(data.students);
  };

  const handleAddClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName) return;
    const res = await fetch("/api/v1/classes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newClassName })
    });
    const data = await res.json();
    if (data.success) {
      setNewClassName("");
      fetchClasses();
      setActiveClass(data.class.id);
    } else {
      alert(data.error);
    }
  };

  const handleDeleteClass = async (id: string) => {
    if (!confirm("Are you sure you want to delete this class?")) return;
    const res = await fetch("/api/v1/classes", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) {
      if (activeClass === id) setActiveClass(null);
      fetchClasses();
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClass || !newStudent.studentId || !newStudent.name) return;
    const res = await fetch("/api/v1/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...newStudent, classId: activeClass })
    });
    const data = await res.json();
    if (data.success) {
      setNewStudent({ studentId: "", name: "" });
      fetchStudents(activeClass);
    } else {
      alert(data.error);
    }
  };

  const handleDeleteStudent = async (id: string) => {
    if (!confirm("Are you sure?")) return;
    const res = await fetch("/api/v1/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    if (res.ok) fetchStudents(activeClass!);
  };

  const handleUpdateStudent = async () => {
    if (!editingStudent) return;
    const res = await fetch("/api/v1/students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingStudent)
    });
    const data = await res.json();
    if (data.success) {
      setEditingStudent(null);
      fetchStudents(activeClass!);
    } else {
      alert(data.error);
    }
  };

  return (
    <div className="max-w-7xl mx-auto w-full p-6">
      {/* Top Navigation */}
      <div className="flex items-center justify-between mb-8">
        <Link href="/" className="inline-flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur border border-slate-200 rounded-xl font-bold text-slate-600 hover:text-indigo-600 hover:border-indigo-200 transition-colors shadow-sm">
          <ArrowLeft className="w-4 h-4" /> Home / 导航页
        </Link>
        <h1 className="text-3xl font-extrabold text-slate-800">Class Management</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Left Column: Classes */}
        <div className="md:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2"><Users className="w-5 h-5"/> Classes</h2>
            
            <form onSubmit={handleAddClass} className="flex gap-2 mb-4">
              <input 
                type="text" 
                placeholder="New Class..." 
                className="flex-1 min-w-0 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                value={newClassName}
                onChange={e => setNewClassName(e.target.value)}
              />
              <button type="submit" className="p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
                <Plus className="w-5 h-5" />
              </button>
            </form>

            <div className="space-y-2">
              {classes.map(c => (
                <div 
                  key={c.id} 
                  className={`group flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors ${activeClass === c.id ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-slate-50 border border-transparent'}`}
                  onClick={() => setActiveClass(c.id)}
                >
                  <span className={`font-bold ${activeClass === c.id ? 'text-indigo-700' : 'text-slate-700'}`}>{c.name}</span>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteClass(c.id); }} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {classes.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No classes yet.</p>}
            </div>
          </div>
        </div>

        {/* Right Column: Students */}
        <div className="md:col-span-3">
          {activeClass ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                Students in {classes.find(c => c.id === activeClass)?.name}
              </h2>

              <form onSubmit={handleAddStudent} className="flex gap-4 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <input 
                  type="text" 
                  placeholder="Student ID (e.g. 2024001)" 
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={newStudent.studentId}
                  onChange={e => setNewStudent({...newStudent, studentId: e.target.value})}
                />
                <input 
                  type="text" 
                  placeholder="Student Name" 
                  className="flex-1 px-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={newStudent.name}
                  onChange={e => setNewStudent({...newStudent, name: e.target.value})}
                />
                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Add Student
                </button>
              </form>

              <div className="overflow-hidden border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-sm font-bold text-slate-500">
                      <th className="py-3 px-6">Student ID</th>
                      <th className="py-3 px-6">Name</th>
                      <th className="py-3 px-6 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map(s => (
                      <tr key={s.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="py-3 px-6 font-medium text-slate-700">
                          {editingStudent?.id === s.id ? (
                            <input type="text" className="border px-2 py-1 rounded w-full" value={editingStudent.studentId} onChange={e => setEditingStudent({...editingStudent, studentId: e.target.value})} />
                          ) : s.studentId}
                        </td>
                        <td className="py-3 px-6 font-bold text-slate-900">
                          {editingStudent?.id === s.id ? (
                            <input type="text" className="border px-2 py-1 rounded w-full" value={editingStudent.name} onChange={e => setEditingStudent({...editingStudent, name: e.target.value})} />
                          ) : s.name}
                        </td>
                        <td className="py-3 px-6 text-right">
                          {editingStudent?.id === s.id ? (
                            <div className="flex justify-end gap-2">
                              <button onClick={handleUpdateStudent} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Save className="w-4 h-4"/></button>
                              <button onClick={() => setEditingStudent(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded"><X className="w-4 h-4"/></button>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <button onClick={() => setEditingStudent(s)} className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded"><Edit2 className="w-4 h-4"/></button>
                              <button onClick={() => handleDeleteStudent(s.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4"/></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {students.length === 0 && (
                      <tr><td colSpan={3} className="py-8 text-center text-slate-400 font-medium">No students in this class.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 font-medium p-12">
              Select or create a class to manage students.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
