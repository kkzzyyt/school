import { MembershipRole, UserRole, UserStatus } from "@/generated/prisma/enums";

import { ApiError, handleApi, notFound } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { approveUserSchema } from "@/server/validation/user";

import { adminUserSelect, serializeAdminUser } from "../../_lib";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const administrator = await requireAdmin();
    const { id } = await routeContext.params;
    const input = approveUserSchema.parse(await request.json().catch(() => null));
    const existing = await prisma.user.findUnique({
      where: { id },
      select: adminUserSelect,
    });
    if (!existing) notFound("用户不存在");
    if (existing.status !== UserStatus.PENDING) {
      throw new ApiError(400, "VALIDATION_ERROR", "只有待审核账号可以批准");
    }

    const classroom = await prisma.classroom.findUnique({
      where: { id: input.classId },
      select: { id: true },
    });
    if (!classroom) {
      throw new ApiError(404, "NOT_FOUND", "默认班级不存在");
    }

    return prisma.$transaction(async (transaction) => {
      await transaction.classMembership.updateMany({
        where: { userId: id },
        data: { isDefault: false },
      });
      await transaction.classMembership.upsert({
        where: { userId_classId: { userId: id, classId: input.classId } },
        update: { role: MembershipRole.OWNER, isDefault: true },
        create: {
          userId: id,
          classId: input.classId,
          role: MembershipRole.OWNER,
          isDefault: true,
        },
      });
      const user = await transaction.user.update({
        where: { id },
        data: { status: UserStatus.ACTIVE, role: UserRole.HEAD_TEACHER },
      });
      await transaction.auditLog.create({
        data: {
          userId: administrator.userId,
          action: "USER_APPROVE",
          entityType: "USER",
          entityId: id,
          metadata: { classId: input.classId },
        },
      });

      const savedUser = await transaction.user.findUnique({
        where: { id: user.id },
        select: adminUserSelect,
      });
      if (!savedUser) {
        throw new ApiError(500, "INTERNAL_ERROR", "用户批准后读取失败");
      }
      return serializeAdminUser(savedUser);
    });
  });
}
