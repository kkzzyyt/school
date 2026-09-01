import {
  calculateSubjectStatistics,
  rankExamResults,
  roundTo,
} from "@/domain/grades";
import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { prisma } from "@/server/db/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const exam = await prisma.exam.findFirst({
      where: { id, classId: context.classId },
      include: {
        subjects: {
          include: {
            subject: true,
            scores: {
              include: { student: { select: { id: true, name: true, studentNo: true } } },
            },
          },
          orderBy: { subject: { sortOrder: "asc" } },
        },
      },
    });
    if (!exam) notFound("考试不存在");

    const activeStudents = await prisma.student.findMany({
      where: { classId: context.classId, status: "ACTIVE" },
      select: { id: true, name: true, studentNo: true },
      orderBy: { studentNo: "asc" },
    });

    const subjectStatistics = exam.subjects.map((examSubject) => ({
      id: examSubject.id,
      subjectId: examSubject.subjectId,
      name: examSubject.subject.name,
      maxScore: Number(examSubject.maxScore),
      passScore: Number(examSubject.passScore),
      ...calculateSubjectStatistics({
        maxScore: Number(examSubject.maxScore),
        passScore: Number(examSubject.passScore),
        scores: examSubject.scores.map((record) => ({
          score: record.score === null ? null : Number(record.score),
          absent: record.absent,
        })),
      }),
    }));

    const rankings = rankExamResults(
      activeStudents.map((student) => ({
        studentId: student.id,
        studentName: student.name,
        studentNo: student.studentNo,
        subjectScores: exam.subjects.map((examSubject) => {
          const record = examSubject.scores.find((score) => score.studentId === student.id);
          return {
            subjectId: examSubject.subjectId,
            score: record?.score === null || record?.score === undefined
              ? null
              : Number(record.score),
            absent: record?.absent ?? false,
          };
        }),
      })),
    ).map((result) => ({
      ...result,
      studentNo: activeStudents.find((student) => student.id === result.studentId)?.studentNo,
    }));

    const recordedScoreCount = exam.subjects.reduce(
      (total, subject) => total + subject.scores.length,
      0,
    );
    const expectedScoreCount = activeStudents.length * exam.subjects.length;

    return {
      exam: { id: exam.id, name: exam.name, examDate: exam.examDate, status: exam.status },
      subjectStatistics,
      rankings,
      overview: {
        studentCount: activeStudents.length,
        subjectCount: exam.subjects.length,
        scoreCoverage:
          expectedScoreCount === 0
            ? 0
            : roundTo((recordedScoreCount / expectedScoreCount) * 100, 2),
        totalAverage:
          rankings.length === 0
            ? null
            : roundTo(
                rankings.reduce((sum, result) => sum + result.total, 0) / rankings.length,
                2,
              ),
      },
    };
  });
}
