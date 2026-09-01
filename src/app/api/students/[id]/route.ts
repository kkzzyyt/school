import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  ensureSinglePrimaryGuardian,
  updateStudentSchema,
} from "@/server/validation/student";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const input = updateStudentSchema.parse(await request.json());

    const existing = await prisma.student.findFirst({
      where: { id, classId: context.classId },
      select: { id: true },
    });
    if (!existing) notFound("学生不存在");

    if (input.guardians) {
      ensureSinglePrimaryGuardian(input.guardians);
    }

    return prisma.$transaction(async (transaction) => {
      const {
        guardians,
        birthDate,
        ...studentFields
      } = input;

      await transaction.student.update({
        where: { id },
        data: {
          ...studentFields,
          ...(birthDate !== undefined
            ? {
                birthDate: birthDate
                  ? new Date(`${birthDate}T00:00:00.000Z`)
                  : null,
              }
            : {}),
        },
      });

      if (guardians) {
        await transaction.guardian.deleteMany({ where: { studentId: id } });
        if (guardians.length > 0) {
          await transaction.guardian.createMany({
            data: guardians.map((guardian) => ({
              studentId: id,
              name: guardian.name,
              relationship: guardian.relationship,
              phone: guardian.phone,
              wechat: guardian.wechat,
              workplace: guardian.workplace,
              isPrimary: guardian.isPrimary,
            })),
          });
        }
      }

      return transaction.student.findUnique({
        where: { id },
        include: { guardians: true },
      });
    });
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const student = await prisma.student.findFirst({
      where: { id, classId: context.classId },
      select: { id: true, _count: { select: { scores: true } } },
    });
    if (!student) notFound("学生不存在");

    if (student._count.scores > 0) {
      return prisma.student.update({
        where: { id },
        data: { status: "TRANSFERRED" },
      });
    }

    await prisma.student.delete({ where: { id } });
    return null;
  });
}
