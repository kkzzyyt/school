import { hash } from "argon2";

import { MembershipRole, UserRole, UserStatus } from "@/generated/prisma/enums";
import { handleApi, ApiError } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  adminUserCreateSchema,
  adminUserQuerySchema,
} from "@/server/validation/user";

import {
  adminUserSelect,
  buildAdminUserWhere,
  serializeAdminUser,
} from "./_lib";

export async function GET(request: Request) {
  return handleApi(async () => {
    await requireAdmin();
    const searchParams = new URL(request.url).searchParams;
    const input = adminUserQuerySchema.parse({
      q: searchParams.get("q") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      role: searchParams.get("role") ?? undefined,
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
    });
    const where = buildAdminUserWhere(input);
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: adminUserSelect,
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      users: users.map(serializeAdminUser),
      total,
      page: input.page,
      pageSize: input.pageSize,
    };
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const administrator = await requireAdmin();
    const input = adminUserCreateSchema.parse(await request.json().catch(() => null));

    const classroom = input.classId
      ? await prisma.classroom.findUnique({
          where: { id: input.classId },
          select: { id: true },
        })
      : null;
    if (input.classId && !classroom) {
      throw new ApiError(404, "NOT_FOUND", "默认班级不存在");
    }

    const passwordHash = await hash(input.password, { type: 2 });
    return prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          role: input.role === "ADMIN" ? UserRole.ADMIN : UserRole.HEAD_TEACHER,
          status: UserStatus.ACTIVE,
        },
      });

      if (input.classId) {
        await transaction.classMembership.create({
          data: {
            userId: user.id,
            classId: input.classId,
            role: MembershipRole.OWNER,
            isDefault: true,
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          userId: administrator.userId,
          action: "USER_CREATE",
          entityType: "USER",
          entityId: user.id,
          metadata: { role: input.role, classId: input.classId ?? null },
        },
      });

      const savedUser = await transaction.user.findUnique({
        where: { id: user.id },
        select: adminUserSelect,
      });
      if (!savedUser) {
        throw new ApiError(500, "INTERNAL_ERROR", "用户创建后读取失败");
      }
      return serializeAdminUser(savedUser);
    });
  });
}
