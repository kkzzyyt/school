import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAdmin: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: {
    session: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  prisma: {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/auth/context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/auth/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { POST } from "./route";

describe("POST /api/admin/users/:id/revoke-sessions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      displayName: "系统管理员",
      userRole: "ADMIN",
    });
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-2" });
    mocks.transaction.session.deleteMany.mockResolvedValue({ count: 3 });
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("revokes all sessions and records the administrator action", async () => {
    const response = await POST(
      new Request("https://school.example/api/admin/users/user-2/revoke-sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: "user-2" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: null });
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-2" } });
    expect(mocks.transaction.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ action: "USER_REVOKE_SESSIONS", entityId: "user-2" }),
    }));
  });
});
