import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function POST(req: NextRequest) {
  try {
    const { submissionId, finalScore } = await req.json();

    if (!submissionId || typeof finalScore !== 'number') {
      return NextResponse.json(
        { error: "Missing or invalid required fields (submissionId, finalScore)." },
        { status: 400 }
      );
    }

    // Update the submission
    const updatedSubmission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        totalScore: finalScore,
        needsReview: false,
        status: "Graded",
      }
    });

    return NextResponse.json({ 
      status: "success",
      message: "Submission successfully confirmed and graded.",
      submission: updatedSubmission
    }, { status: 200 });

  } catch (error) {
    console.error("Confirm Submission API Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error during confirmation." },
      { status: 500 }
    );
  }
}
