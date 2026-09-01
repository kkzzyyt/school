import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { assertStudentsBelongToClass } from "@/server/services/class-access";
import { dutyInputSchema } from "@/server/validation/duty";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const input = dutyInputSchema.partial().parse(await request.json());
    const existing = await prisma.dutyGroup.findFirst({
      where: { id, classId: context.classId },
      select: { id: true },
    });
    if (!existing) notFound("值日小组不存在");
    if (input.studentIds) {
      await assertStudentsBelongToClass(input.studentIds, context.classId);
    }

    return prisma.$transaction(async (transaction) => {
      const { studentIds, ...fields } = input;
      await transaction.dutyGroup.update({ where: { id }, data: fields });
      if (studentIds) {
        await transaction.dutyAssignment.deleteMany({ where: { dutyGroupId: id } });
        if (studentIds.length > 0) {
          await transaction.dutyAssignment.createMany({
            data: [...new Set(studentIds)].map((studentId) => ({
              dutyGroupId: id,
              studentId,
            })),
          });
        }
      }
      return transaction.dutyGroup.findUnique({
        where: { id },
        include: { assignments: { include: { student: true } } },
      });
    });
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const deleted = await prisma.dutyGroup.deleteMany({
      where: { id, classId: context.classId },
    });
    if (deleted.count === 0) notFound("值日小组不存在");
    return null;
  });
}
