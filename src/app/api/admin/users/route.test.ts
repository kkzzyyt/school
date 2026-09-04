import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAdmin: vi.fn(),
  hash: vi.fn(),
  userFindMany: vi.fn(),
  userCount: vi.fn(),
  userCreate: vi.fn(),
  classroomFindUnique: vi.fn(),
  transaction: {
    user: { create: vi.fn(), findUnique: vi.fn() },
    classMembership: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  prisma: {
    user: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
    },
    classroom: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("argon2", () => ({ hash: mocks.hash }));
vi.mock("@/server/auth/context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/auth/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { GET, POST } from "./route";

const adminIdentity = {
  userId: "admin-1",
  username: "admin",
  displayName: "系统管理员",
  userRole: "ADMIN" as const,
};

const classroom = {
  id: "class-1",
  name: "高二（3）班",
  grade: "高二",
  academicYear: "2026-2027",
  semester: "FIRST",
};

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

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(`https://school.example${url}`, {
    method,
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

describe("admin user collection routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue(adminIdentity);
    mocks.hash.mockResolvedValue("$argon2id$admin-hash");
    mocks.prisma.user.findMany.mockResolvedValue([pendingUser]);
    mocks.prisma.user.count.mockResolvedValue(1);
    mocks.prisma.classroom.findUnique.mockResolvedValue(classroom);
    mocks.transaction.user.create.mockResolvedValue({
      ...pendingUser,
      status: "ACTIVE",
      memberships: [],
    });
    mocks.transaction.user.findUnique.mockResolvedValue({
      ...pendingUser,
      status: "ACTIVE",
      memberships: [],
    });
    mocks.transaction.classMembership.create.mockResolvedValue({ id: "membership-1" });
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("lists safe user fields and supports pending filters", async () => {
    const response = await GET(
      new Request("https://school.example/api/admin/users?q=wang&status=PENDING&page=2&pageSize=20"),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: { users: [{ id: "user-2", username: "teacher2", status: "PENDING" }], total: 1, page: 2, pageSize: 20 },
    });
    expect(JSON.stringify(body)).not.toContain("passwordHash");
    expect(mocks.prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 20,
      take: 20,
      where: expect.objectContaining({ status: "PENDING" }),
    }));
  });

  it("creates an active head teacher and assigns the default class atomically", async () => {
    const response = await POST(jsonRequest("/api/admin/users", {
      username: "teacher2",
      displayName: "王老师",
      password: "Teacher123",
      confirmPassword: "Teacher123",
      role: "HEAD_TEACHER",
      classId: "class-1",
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { username: "teacher2", status: "ACTIVE" } });
    expect(mocks.hash).toHaveBeenCalledWith("Teacher123", { type: 2 });
    expect(mocks.transaction.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: "teacher2",
        passwordHash: "$argon2id$admin-hash",
        role: "HEAD_TEACHER",
        status: "ACTIVE",
      }),
    });
    expect(mocks.transaction.classMembership.create).toHaveBeenCalledWith({
      data: { userId: "user-2", classId: "class-1", role: "OWNER", isDefault: true },
    });
    expect(mocks.transaction.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: "admin-1",
        action: "USER_CREATE",
        entityType: "USER",
        entityId: "user-2",
      }),
    }));
  });

  it("stops a non-administrator before reading users", async () => {
    mocks.requireAdmin.mockRejectedValue(new ApiError(403, "FORBIDDEN", "只有管理员可以管理用户"));

    const response = await GET(new Request("https://school.example/api/admin/users"));
    const body = await responseBody(response);

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    expect(mocks.prisma.user.findMany).not.toHaveBeenCalled();
  });
});
