import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAdmin: vi.fn(),
  userFindUnique: vi.fn(),
  classroomFindUnique: vi.fn(),
  transaction: {
    user: { update: vi.fn(), findUnique: vi.fn() },
    classMembership: { updateMany: vi.fn(), upsert: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  prisma: {
    user: { findUnique: vi.fn() },
    classroom: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/auth/context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/auth/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { POST } from "./route";

const pendingUser = {
  id: "user-2",
  username: "teacher2",
  displayName: "王老师",
  role: "HEAD_TEACHER",
  status: "PENDING",
  lastLoginAt: null,
  createdAt: new Date("2026-09-04T00:00:00.000Z"),
  updatedAt: new Date("2026-09-04T00:00:00.000Z"),
  memberships: [],
};

function jsonRequest(body: unknown) {
  return new Request("https://school.example/api/admin/users/user-2/approve", {
    method: "POST",
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

describe("POST /api/admin/users/:id/approve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      displayName: "系统管理员",
      userRole: "ADMIN",
    });
    mocks.prisma.user.findUnique.mockResolvedValue(pendingUser);
    mocks.prisma.classroom.findUnique.mockResolvedValue({ id: "class-1", name: "高二（3）班" });
    mocks.transaction.user.update.mockResolvedValue({ ...pendingUser, status: "ACTIVE" });
    mocks.transaction.user.findUnique.mockResolvedValue({ ...pendingUser, status: "ACTIVE" });
    mocks.transaction.classMembership.updateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.classMembership.upsert.mockResolvedValue({ id: "membership-1" });
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("activates a pending account and assigns its default class", async () => {
    const response = await POST(jsonRequest({ classId: "class-1" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { status: "ACTIVE" } });
    expect(mocks.transaction.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { status: "ACTIVE", role: "HEAD_TEACHER" },
    });
    expect(mocks.transaction.classMembership.upsert).toHaveBeenCalledWith({
      where: { userId_classId: { userId: "user-2", classId: "class-1" } },
      update: { isDefault: true, role: "OWNER" },
      create: { userId: "user-2", classId: "class-1", role: "OWNER", isDefault: true },
    });
  });

  it("does not approve a non-pending account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ ...pendingUser, status: "ACTIVE" });

    const response = await POST(jsonRequest({ classId: "class-1" }), {
      params: Promise.resolve({ id: "user-2" }),
    });
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("stops a non-administrator before reading the request", async () => {
    mocks.requireAdmin.mockRejectedValue(new ApiError(403, "FORBIDDEN", "只有管理员可以管理用户"));

    const response = await POST(jsonRequest({ classId: "class-1" }), {
      params: Promise.resolve({ id: "user-2" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
