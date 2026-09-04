import { UserRole, UserStatus, MembershipRole } from "@/generated/prisma/enums";

import { ApiError, handleApi, notFound } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { adminUserPatchSchema } from "@/server/validation/user";

import {
  adminUserSelect,
  getDefaultClassId,
  serializeAdminUser,
} from "../_lib";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const administrator = await requireAdmin();
    const { id } = await routeContext.params;
    const input = adminUserPatchSchema.parse(await request.json().catch(() => null));
    const existing = await prisma.user.findUnique({
      where: { id },
      select: adminUserSelect,
    });
    if (!existing) notFound("用户不存在");

    const nextRole = input.role ?? existing.role;
    const nextStatus = input.status ?? existing.status;
    const nextClassId = input.classId === undefined
      ? getDefaultClassId(existing)
      : input.classId;

    if (
      administrator.userId === id
      && (nextRole !== UserRole.ADMIN || nextStatus !== UserStatus.ACTIVE)
    ) {
      throw new ApiError(400, "VALIDATION_ERROR", "不能停用或降级当前管理员账号");
    }

    if (
      existing.role === UserRole.ADMIN
      && existing.status === UserStatus.ACTIVE
      && (nextRole !== UserRole.ADMIN || nextStatus !== UserStatus.ACTIVE)
    ) {
      const remainingAdministrators = await prisma.user.count({
        where: {
          id: { not: id },
          role: UserRole.ADMIN,
          status: UserStatus.ACTIVE,
        },
      });
      if (remainingAdministrators === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "系统至少需要保留一个启用中的管理员");
      }
    }

    if (nextRole === UserRole.HEAD_TEACHER && nextStatus === UserStatus.ACTIVE && !nextClassId) {
      throw new ApiError(400, "VALIDATION_ERROR", "启用班主任必须分配默认班级");
    }

    const classroom = input.classId
      ? await prisma.classroom.findUnique({ where: { id: input.classId }, select: { id: true } })
      : null;
    if (input.classId && !classroom) {
      throw new ApiError(404, "NOT_FOUND", "默认班级不存在");
    }

    return prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.role !== undefined
            ? { role: input.role === "ADMIN" ? UserRole.ADMIN : UserRole.HEAD_TEACHER }
            : {}),
          ...(input.status !== undefined
            ? { status: input.status === "ACTIVE" ? UserStatus.ACTIVE : UserStatus.DISABLED }
            : {}),
        },
      });

      if (input.classId !== undefined) {
        await transaction.classMembership.updateMany({
          where: { userId: id },
          data: { isDefault: false },
        });
        if (input.classId === null) {
          await transaction.classMembership.deleteMany({ where: { userId: id } });
        } else {
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
        }
      }

      if (nextStatus === UserStatus.DISABLED) {
        await transaction.session.deleteMany({ where: { userId: id } });
      }

      await transaction.auditLog.create({
        data: {
          userId: administrator.userId,
          action: "USER_UPDATE",
          entityType: "USER",
          entityId: id,
          metadata: {
            ...(input.displayName !== undefined ? { displayNameChanged: true } : {}),
            ...(input.role !== undefined ? { role: input.role } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.classId !== undefined ? { classId: input.classId } : {}),
          },
        },
      });

      const savedUser = await transaction.user.findUnique({
        where: { id: user.id },
        select: adminUserSelect,
      });
      if (!savedUser) {
        throw new ApiError(500, "INTERNAL_ERROR", "用户更新后读取失败");
      }
      return serializeAdminUser(savedUser);
    });
  });
}
