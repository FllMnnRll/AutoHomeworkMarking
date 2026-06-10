import { PrismaClient } from "@prisma/client";
import ReviewClient from "./ReviewClient";
import { redirect } from "next/navigation";

export const dynamic = 'force-dynamic';

const prisma = new PrismaClient();

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ submissionId?: string }> }) {
  // If no submissionId is provided, just grab the first one that needs review
  let submission;
  
  const params = await searchParams;
  
  if (params.submissionId) {
    submission = await prisma.submission.findUnique({
      where: { id: params.submissionId },
      include: { student: true, slices: true }
    });
  } else {
    submission = await prisma.submission.findFirst({
      where: { needsReview: true },
      include: { student: true, slices: true }
    });
    
    if (submission) {
      redirect(`/review?submissionId=${submission.id}`);
    }
  }

  if (!submission) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh]">
        <h1 className="text-2xl font-bold text-slate-700">No submission selected</h1>
        <p className="text-slate-500 mt-2">Please go to Results and select a student to review.</p>
      </div>
    );
  }

  // Fetch sibling submissions for the dropdown
  const otherSubmissions = await prisma.submission.findMany({
    where: { assignmentId: submission.assignmentId },
    include: { student: true }
  });

  const activeSlice = submission.slices[0]; // For now, we assume 1 slice per submission in the mock

  return <ReviewClient submission={submission} activeSlice={activeSlice} otherSubmissions={otherSubmissions} />;
}
