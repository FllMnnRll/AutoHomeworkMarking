import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const classId = url.searchParams.get("classId");
    
    const whereClause = classId ? { classId } : {};
    
    const students = await prisma.student.findMany({
      where: whereClause,
      orderBy: { name: 'asc' }
    });
    
    return NextResponse.json({ success: true, students });
  } catch (error) {
    console.error("Failed to fetch students", error);
    return NextResponse.json({ error: "Failed to fetch students" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { studentId, name, classId } = await req.json();
    if (!studentId || !name || !classId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const newStudent = await prisma.student.create({
      data: { studentId, name, classId }
    });
    return NextResponse.json({ success: true, student: newStudent });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Student ID already exists" }, { status: 400 });
    }
    console.error("Failed to create student", error);
    return NextResponse.json({ error: "Failed to create student" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, studentId, name, classId } = await req.json();
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    const updatedStudent = await prisma.student.update({
      where: { id },
      data: { studentId, name, classId }
    });
    
    return NextResponse.json({ success: true, student: updatedStudent });
  } catch (error) {
    console.error("Failed to update student", error);
    return NextResponse.json({ error: "Failed to update student" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "ID is required" }, { status: 400 });

    await prisma.student.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete student", error);
    return NextResponse.json({ error: "Failed to delete student" }, { status: 500 });
  }
}
