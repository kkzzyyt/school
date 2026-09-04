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

describe("GET /api/admin/classes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({
      userId: "admin-1",
      username: "admin",
      displayName: "系统管理员",
      userRole: "ADMIN",
    });
    mocks.classroomFindMany.mockResolvedValue([
      {
        id: "class-1",
        name: "高一（8）班",
        grade: "高一",
        academicYear: "2026-2027",
        semester: "FIRST",
        room: "302",
        students: [
          { id: "student-1", studentNo: "2026001", name: "陈晨", gender: "MALE", status: "ACTIVE" },
        ],
      },
    ]);
  });

  it("returns class summaries with only simple student information", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        classes: [{
          id: "class-1",
          name: "高一（8）班",
          studentCount: 1,
          students: [{ id: "student-1", studentNo: "2026001", name: "陈晨", gender: "MALE", status: "ACTIVE" }],
        }],
      },
    });
    expect(JSON.stringify(body)).not.toContain("phone");
    expect(JSON.stringify(body)).not.toContain("address");
    expect(mocks.classroomFindMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        students: expect.objectContaining({
          select: { id: true, studentNo: true, name: true, gender: true, status: true },
        }),
      }),
    }));
  });

  it("rejects non-administrators before querying classes", async () => {
    mocks.requireAdmin.mockRejectedValue(new ApiError(403, "FORBIDDEN", "只有管理员可以管理用户"));

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.classroomFindMany).not.toHaveBeenCalled();
  });
});
