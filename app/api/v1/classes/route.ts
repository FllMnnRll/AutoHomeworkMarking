import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    const classes = await prisma.class.findMany({
      include: {
        _count: {
          select: { students: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ success: true, classes });
  } catch (error) {
    console.error("Failed to fetch classes", error);
    return NextResponse.json({ error: "Failed to fetch classes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "Class name is required" }, { status: 400 });

    const newClass = await prisma.class.create({
      data: { name }
    });
    return NextResponse.json({ success: true, class: newClass });
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "Class name already exists" }, { status: 400 });
    }
    console.error("Failed to create class", error);
    return NextResponse.json({ error: "Failed to create class" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "Class ID is required" }, { status: 400 });

    // In a real app we'd handle cascading deletes or prevent delete if students exist.
    // Assuming Prisma schema handles it or we manually delete/unlink here.
    // But since Student.classId is just a string, it won't crash DB on delete.
    await prisma.class.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete class", error);
    return NextResponse.json({ error: "Failed to delete class" }, { status: 500 });
  }
}
