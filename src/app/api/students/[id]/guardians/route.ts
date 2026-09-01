import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { guardianInputSchema } from "@/server/validation/student";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const student = await prisma.student.findFirst({
      where: { id, classId: context.classId },
      select: { id: true },
    });
    if (!student) notFound("学生不存在");
    return prisma.guardian.findMany({
      where: { studentId: id },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });
  });
}

export async function POST(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const input = guardianInputSchema.parse(await request.json());
    const student = await prisma.student.findFirst({
      where: { id, classId: context.classId },
      select: { id: true },
    });
    if (!student) notFound("学生不存在");

    return prisma.$transaction(async (transaction) => {
      if (input.isPrimary) {
        await transaction.guardian.updateMany({
          where: { studentId: id, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return transaction.guardian.create({
        data: {
          studentId: id,
          name: input.name,
          relationship: input.relationship,
          phone: input.phone,
          wechat: input.wechat,
          workplace: input.workplace,
          isPrimary: input.isPrimary,
        },
      });
    });
  });
}
