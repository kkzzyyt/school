import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAdmin: vi.fn(),
  userFindUnique: vi.fn(),
  userCount: vi.fn(),
  classroomFindUnique: vi.fn(),
  transaction: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    session: { deleteMany: vi.fn() },
    classMembership: { updateMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  prisma: {
    user: { findUnique: vi.fn(), count: vi.fn() },
    classroom: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/auth/context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/auth/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { PATCH } from "./route";

const adminIdentity = {
  userId: "admin-1",
  username: "admin",
  displayName: "系统管理员",
  userRole: "ADMIN" as const,
};

const activeTeacher = {
  id: "user-2",
  username: "teacher2",
  displayName: "王老师",
  role: "HEAD_TEACHER",
  status: "ACTIVE",
  lastLoginAt: null,
  createdAt: new Date("2026-09-04T00:00:00.000Z"),
  updatedAt: new Date("2026-09-04T00:00:00.000Z"),
  memberships: [{ classId: "class-1", isDefault: true }],
};

function jsonRequest(body: unknown) {
  return new Request("https://school.example/api/admin/users/user-2", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  };
}

describe("PATCH /api/admin/users/:id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(adminIdentity);
    mocks.prisma.user.findUnique.mockResolvedValue(activeTeacher);
    mocks.prisma.classroom.findUnique.mockResolvedValue({ id: "class-1", name: "高二（3）班" });
    mocks.prisma.user.count.mockResolvedValue(1);
    mocks.transaction.user.update.mockResolvedValue({ ...activeTeacher, status: "DISABLED" });
    mocks.transaction.user.findUnique.mockResolvedValue({ ...activeTeacher, status: "DISABLED" });
    mocks.transaction.session.deleteMany.mockResolvedValue({ count: 2 });
    mocks.transaction.classMembership.updateMany.mockResolvedValue({ count: 1 });
    mocks.transaction.classMembership.upsert.mockResolvedValue({ id: "membership-1" });
    mocks.transaction.classMembership.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("disables a user and revokes all of the user's sessions", async () => {
    const response = await PATCH(jsonRequest({ status: "DISABLED" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { status: "DISABLED" } });
    expect(mocks.transaction.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { status: "DISABLED" },
    });
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-2" } });
  });

  it("protects the last active administrator", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      ...activeTeacher,
      role: "ADMIN",
      status: "ACTIVE",
      memberships: [],
    });
    mocks.prisma.user.count.mockResolvedValue(0);

    const response = await PATCH(
      new Request("https://school.example/api/admin/users/admin-2", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "DISABLED" }),
      }),
      { params: Promise.resolve({ id: "admin-2" }) },
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stops a non-administrator before querying the target", async () => {
    mocks.requireAdmin.mockRejectedValue(new ApiError(403, "FORBIDDEN", "只有管理员可以管理用户"));

    const response = await PATCH(jsonRequest({ displayName: "新名字" }), {
      params: Promise.resolve({ id: "user-2" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
