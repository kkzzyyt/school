import { handleApi, notFound } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const administrator = await requireAdmin();
    const { id } = await routeContext.params;
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) notFound("用户不存在");

    await prisma.$transaction(async (transaction) => {
      await transaction.session.deleteMany({ where: { userId: id } });
      await transaction.auditLog.create({
        data: {
          userId: administrator.userId,
          action: "USER_REVOKE_SESSIONS",
          entityType: "USER",
          entityId: id,
        },
      });
    });

    return null;
  });
}
