import { hash } from "argon2";

import { handleApi, notFound } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { resetPasswordSchema } from "@/server/validation/user";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const administrator = await requireAdmin();
    const { id } = await routeContext.params;
    const input = resetPasswordSchema.parse(await request.json().catch(() => null));
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) notFound("用户不存在");

    const passwordHash = await hash(input.password, { type: 2 });
    await prisma.$transaction(async (transaction) => {
      await transaction.user.update({ where: { id }, data: { passwordHash } });
      await transaction.session.deleteMany({ where: { userId: id } });
      await transaction.auditLog.create({
        data: {
          userId: administrator.userId,
          action: "USER_RESET_PASSWORD",
          entityType: "USER",
          entityId: id,
        },
      });
    });

    return null;
  });
}
