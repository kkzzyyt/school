import { z } from "zod";

import { handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

const createExamSchema = z.object({
  name: z.string().trim().min(1, "请输入考试名称").max(100),
  examDate: z.iso.date(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
  subjects: z
    .array(
      z.object({
        subjectId: z.string().min(1),
        maxScore: z.number().positive().max(999),
        passScore: z.number().nonnegative().max(999),
      }),
    )
    .min(1, "请至少选择一个科目"),
});

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const [exams, subjects] = await Promise.all([
      prisma.exam.findMany({
        where: { classId: context.classId },
        include: {
          subjects: {
            include: { subject: true },
            orderBy: { subject: { sortOrder: "asc" } },
          },
        },
        orderBy: { examDate: "desc" },
      }),
      prisma.subject.findMany({ orderBy: { sortOrder: "asc" } }),
    ]);
    return { exams, subjects };
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = createExamSchema.parse(await request.json());
    if (input.subjects.some((subject) => subject.passScore > subject.maxScore)) {
      throw new z.ZodError([
        { code: "custom", path: ["subjects"], message: "及格分不能高于满分" },
      ]);
    }

    return prisma.exam.create({
      data: {
        classId: context.classId,
        name: input.name,
        examDate: new Date(`${input.examDate}T00:00:00.000Z`),
        status: input.status,
        subjects: { create: input.subjects },
      },
      include: { subjects: { include: { subject: true } } },
    });
  });
}
