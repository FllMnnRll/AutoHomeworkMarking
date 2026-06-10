import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { id, title } = await req.json();
    if (!id || !title) return NextResponse.json({ error: "Missing id or title" }, { status: 400 });

    const assignment = await prisma.assignment.update({
      where: { id },
      data: { title }
    });

    return NextResponse.json({ success: true, assignment });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to update assignment" }, { status: 500 });
  }
}
