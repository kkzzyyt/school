import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  classroomFindMany: vi.fn(),
}));

vi.mock("@/server/auth/context", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@/server/db/prisma", () => ({
  prisma: { classroom: { findMany: mocks.classroomFindMany } },
}));

import { GET } from "./route";

describe("GET /api/admin/classrooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      displayName: "系统管理员",
      userRole: "ADMIN",
    });
    mocks.classroomFindMany.mockResolvedValue([
      { id: "class-1", name: "高一（8）班", grade: "高一", academicYear: "2026-2027", semester: "FIRST" },
    ]);
  });

  it("returns only class summaries for administrators", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { classrooms: [{ id: "class-1", name: "高一（8）班" }] } });
    expect(mocks.classroomFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: { id: true, name: true, grade: true, academicYear: true, semester: true },
    }));
  });

  it("rejects a non-administrator before querying classes", async () => {
    mocks.requireAdmin.mockRejectedValue(new ApiError(403, "FORBIDDEN", "只有管理员可以管理用户"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.classroomFindMany).not.toHaveBeenCalled();
  });
});
