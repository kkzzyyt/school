import { z } from "zod";

import { handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { assertStudentsBelongToClass } from "@/server/services/class-access";

const committeeSchema = z.object({
  members: z.array(
    z.object({
      studentId: z.string().min(1),
      title: z.string().trim().min(1, "请输入职务").max(50),
      responsibilities: z.string().trim().max(255).optional().nullable(),
      sortOrder: z.number().int().min(0),
    }),
  ),
});

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const [members, students] = await Promise.all([
      prisma.committeeMember.findMany({
        where: { classId: context.classId },
        include: { student: { select: { id: true, name: true, studentNo: true } } },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.student.findMany({
        where: { classId: context.classId, status: "ACTIVE" },
        select: { id: true, name: true, studentNo: true },
        orderBy: { studentNo: "asc" },
      }),
    ]);
    return { members, students };
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = committeeSchema.parse(await request.json());
    await assertStudentsBelongToClass(
      input.members.map((member) => member.studentId),
      context.classId,
    );
    if (new Set(input.members.map((member) => member.title)).size !== input.members.length) {
      throw new z.ZodError([
        { code: "custom", path: ["members"], message: "班委职务不能重复" },
      ]);
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.committeeMember.deleteMany({ where: { classId: context.classId } });
      if (input.members.length > 0) {
        await transaction.committeeMember.createMany({
          data: input.members.map((member) => ({ ...member, classId: context.classId })),
        });
      }
    });
    return { count: input.members.length };
  });
}
