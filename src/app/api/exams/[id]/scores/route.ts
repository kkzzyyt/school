import { z } from "zod";

import { ApiError, handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { assertStudentsBelongToClass } from "@/server/services/class-access";

const scoresSchema = z.object({
  scores: z.array(
    z.object({
      examSubjectId: z.string().min(1),
      studentId: z.string().min(1),
      score: z.number().nonnegative().nullable(),
      absent: z.boolean().default(false),
    }),
  ),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const input = scoresSchema.parse(await request.json());
    const exam = await prisma.exam.findFirst({
      where: { id, classId: context.classId },
      include: { subjects: true },
    });
    if (!exam) notFound("考试不存在");

    await assertStudentsBelongToClass(
      input.scores.map((score) => score.studentId),
      context.classId,
    );
    const subjectById = new Map(exam.subjects.map((subject) => [subject.id, subject]));

    for (const record of input.scores) {
      const examSubject = subjectById.get(record.examSubjectId);
      if (!examSubject) {
        throw new ApiError(400, "VALIDATION_ERROR", "成绩科目不属于当前考试");
      }
      if (!record.absent && (record.score === null || record.score > Number(examSubject.maxScore))) {
        throw new ApiError(400, "VALIDATION_ERROR", "成绩必须在 0 和满分之间");
      }
    }

    await prisma.$transaction(
      input.scores.map((record) =>
        prisma.score.upsert({
          where: {
            examSubjectId_studentId: {
              examSubjectId: record.examSubjectId,
              studentId: record.studentId,
            },
          },
          create: {
            examSubjectId: record.examSubjectId,
            studentId: record.studentId,
            absent: record.absent,
            score: record.absent ? null : record.score,
          },
          update: {
            absent: record.absent,
            score: record.absent ? null : record.score,
          },
        }),
      ),
    );
    return { count: input.scores.length };
  });
}
