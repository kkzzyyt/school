import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAdmin: vi.fn(),
  hash: vi.fn(),
  userFindUnique: vi.fn(),
  transaction: {
    user: { update: vi.fn() },
    session: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  prisma: {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("argon2", () => ({ hash: mocks.hash }));
vi.mock("@/server/auth/context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/auth/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { POST } from "./route";

function jsonRequest(body: unknown) {
  return new Request("https://school.example/api/admin/users/user-2/reset-password", {
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

describe("POST /api/admin/users/:id/reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      displayName: "系统管理员",
      userRole: "ADMIN",
    });
    mocks.hash.mockResolvedValue("$argon2id$new-password-hash");
    mocks.prisma.user.findUnique.mockResolvedValue({ id: "user-2" });
    mocks.transaction.user.update.mockResolvedValue({ id: "user-2" });
    mocks.transaction.session.deleteMany.mockResolvedValue({ count: 2 });
    mocks.transaction.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("hashes the new password and revokes old sessions", async () => {
    const response = await POST(jsonRequest({
      password: "NewPassword123",
      confirmPassword: "NewPassword123",
    }), { params: Promise.resolve({ id: "user-2" }) });
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: null });
    expect(mocks.hash).toHaveBeenCalledWith("NewPassword123", { type: 2 });
    expect(mocks.transaction.user.update).toHaveBeenCalledWith({
      where: { id: "user-2" },
      data: { passwordHash: "$argon2id$new-password-hash" },
    });
    expect(mocks.transaction.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-2" } });
  });
});
