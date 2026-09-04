import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionDelete: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: mocks.cookies }));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    session: {
      findUnique: mocks.sessionFindUnique,
      delete: mocks.sessionDelete,
    },
  },
}));

import {
  getAuthContext,
  getAuthIdentity,
  requireAdmin,
} from "./context";

const activeSession = {
  id: "session-1",
  expiresAt: new Date("2099-01-01T00:00:00.000Z"),
  user: {
    id: "user-1",
    username: "admin",
    displayName: "系统管理员",
    role: "ADMIN",
    status: "ACTIVE",
    memberships: [],
  },
};

describe("authentication contexts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.cookies.mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "raw-token" }),
    });
    mocks.sessionFindUnique.mockResolvedValue(activeSession);
  });

  it("keeps a logged-in administrator authenticated without a class membership", async () => {
    await expect(getAuthIdentity()).resolves.toMatchObject({
      userId: "user-1",
      userRole: "ADMIN",
    });
    await expect(getAuthContext()).resolves.toBeNull();
  });

  it("still exposes the default class context for a workspace user", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      ...activeSession,
      user: {
        ...activeSession.user,
        role: "HEAD_TEACHER",
        memberships: [{
          classId: "class-1",
          isDefault: true,
          classroom: { id: "class-1", name: "高一（8）班", grade: "高一", room: "302" },
        }],
      },
    });

    await expect(getAuthContext()).resolves.toMatchObject({
      userId: "user-1",
      classId: "class-1",
      className: "高一（8）班",
    });
  });

  it("allows an administrator-only guard without requiring a class", async () => {
    await expect(requireAdmin()).resolves.toMatchObject({ userId: "user-1", userRole: "ADMIN" });
  });

  it("rejects a head teacher at the administrator guard", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      ...activeSession,
      user: { ...activeSession.user, role: "HEAD_TEACHER", memberships: [{ classId: "class-1" }] },
    });

    await expect(requireAdmin()).rejects.toEqual(
      new ApiError(403, "FORBIDDEN", "只有管理员可以管理用户"),
    );
  });
});
