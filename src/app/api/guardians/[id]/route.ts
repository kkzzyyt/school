import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { guardianInputSchema } from "@/server/validation/student";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const input = guardianInputSchema.partial().parse(await request.json());
    const existing = await prisma.guardian.findFirst({
      where: { id, student: { classId: context.classId } },
      select: { id: true, studentId: true },
    });
    if (!existing) notFound("联系人不存在");

    return prisma.$transaction(async (transaction) => {
      if (input.isPrimary) {
        await transaction.guardian.updateMany({
          where: { studentId: existing.studentId, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return transaction.guardian.update({ where: { id }, data: input });
    });
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const deleted = await prisma.guardian.deleteMany({
      where: { id, student: { classId: context.classId } },
    });
    if (deleted.count === 0) notFound("联系人不存在");
    return null;
  });
}
