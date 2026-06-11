import React from "react";
import { prisma } from "@/lib/prisma";
import StudentAnalyticsClient from "./StudentAnalyticsClient";
import ClassAnalyticsClient from "./ClassAnalyticsClient";
import AnalyticsHistoryList from "./AnalyticsHistoryList";

export const dynamic = 'force-dynamic';

export default async function AnalyticsDashboard({ 
  searchParams 
}: { 
  searchParams: Promise<{ assignmentId?: string; submissionId?: string }> 
}) {
  const params = await searchParams;
  const { assignmentId, submissionId } = params;

  // Case 1: Individual Student Analytics Profile
  if (submissionId) {
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        student: true,
        assignment: true,
        slices: true
      }
    });

    if (!submission) {
      return (
        <div className="p-8 text-center text-slate-500 font-medium bg-white/60 backdrop-blur-md rounded-2xl border border-white max-w-md mx-auto mt-12">
          Submission not found.
        </div>
      );
    }

    return <StudentAnalyticsClient submission={submission} />;
  }

  // Case 2: Class Assignment Analytics Dashboard
  if (assignmentId) {
    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { class: true }
    });

    if (!assignment) {
      return (
        <div className="p-8 text-center text-slate-500 font-medium bg-white/60 backdrop-blur-md rounded-2xl border border-white max-w-md mx-auto mt-12">
          Assignment not found.
        </div>
      );
    }

    const classAnalytics = await prisma.classAnalytics.findUnique({
      where: { assignmentId }
    });

    const submissions = await prisma.submission.findMany({
      where: { assignmentId },
      include: { student: true }
    });

    return (
      <ClassAnalyticsClient 
        assignment={assignment} 
        analytics={classAnalytics} 
        submissions={submissions} 
      />
    );
  }

  // Case 3: Main History List Dashboard (Default)
  const assignments = await prisma.assignment.findMany({
    include: {
      class: true,
      analytics: true,
      submissions: {
        select: {
          status: true,
          totalScore: true,
        }
      }
    },
    orderBy: {
      date: "desc"
    }
  });

  const assignmentsWithStats = assignments.map((item) => {
    const gradedSubmissions = item.submissions.filter(s => s.status === "Graded" && s.totalScore !== null);
    const submissionsCount = item.submissions.length;
    const totalScoreSum = gradedSubmissions.reduce((sum, s) => sum + (s.totalScore || 0), 0);
    const averageScore = gradedSubmissions.length > 0 ? Math.round(totalScoreSum / gradedSubmissions.length) : 0;

    return {
      id: item.id,
      title: item.title,
      subject: item.subject,
      date: item.date,
      class: item.class,
      submissionsCount,
      averageScore,
      analyticsStatus: item.analytics ? item.analytics.status : "None"
    };
  });

  return <AnalyticsHistoryList assignmentsWithStats={assignmentsWithStats} />;
}
