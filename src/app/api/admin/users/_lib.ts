import type { Prisma } from "@/generated/prisma/client";

export const adminUserSelect = {
  id: true,
  username: true,
  displayName: true,
  role: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  memberships: {
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: {
      id: true,
      classId: true,
      role: true,
      isDefault: true,
      classroom: {
        select: {
          id: true,
          name: true,
          grade: true,
          academicYear: true,
        },
      },
    },
  },
} satisfies Prisma.UserSelect;

export type AdminUserRecord = Prisma.UserGetPayload<{ select: typeof adminUserSelect }>;

export function serializeAdminUser(user: AdminUserRecord) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    memberships: user.memberships.map((membership) => ({
      id: membership.id,
      classId: membership.classId,
      role: membership.role,
      isDefault: membership.isDefault,
      classroom: membership.classroom,
    })),
  };
}

export function getDefaultClassId(user: Pick<AdminUserRecord, "memberships">): string | null {
  return user.memberships.find((membership) => membership.isDefault)?.classId
    ?? user.memberships[0]?.classId
    ?? null;
}

export function buildAdminUserWhere(input: {
  q?: string;
  status?: "PENDING" | "ACTIVE" | "DISABLED";
  role?: "ADMIN" | "HEAD_TEACHER";
}): Prisma.UserWhereInput {
  const query = input.q?.trim();
  return {
    ...(query
      ? {
          OR: [
            { username: { contains: query } },
            { displayName: { contains: query } },
          ],
        }
      : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.role ? { role: input.role } : {}),
  };
}
