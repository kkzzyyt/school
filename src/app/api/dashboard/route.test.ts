import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  requireAuthContext: vi.fn(),
  studentGroupBy: vi.fn(),
  timetableEntryFindMany: vi.fn(),
  dutyGroupFindMany: vi.fn(),
  workItemFindMany: vi.fn(),
  examFindMany: vi.fn(),
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    student: { groupBy: mocks.studentGroupBy },
    timetableEntry: { findMany: mocks.timetableEntryFindMany },
    dutyGroup: { findMany: mocks.dutyGroupFindMany },
    workItem: { findMany: mocks.workItemFindMany },
    exam: { findMany: mocks.examFindMany },
  },
}));

import { GET } from "./route";

describe("GET /api/dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue({
      userId: "user-1",
      username: "mx",
      displayName: "孟想",
      userRole: "HEAD_TEACHER",
      classId: "class-1",
      className: "高二（3）班",
      grade: "高二",
      room: "401",
    });
    mocks.studentGroupBy.mockResolvedValue([
      { gender: "MALE", _count: { _all: 14 } },
      { gender: "FEMALE", _count: { _all: 10 } },
    ]);
    mocks.timetableEntryFindMany.mockResolvedValue([]);
    mocks.dutyGroupFindMany.mockResolvedValue([]);
    mocks.workItemFindMany.mockResolvedValue([
      { id: "work-1", title: "填报体检表", priority: "HIGH", dueAt: null },
    ]);
    mocks.examFindMany.mockResolvedValue([]);
  });

  it("returns aggregated dashboard data with calculated gender counts from a single groupBy", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      classInfo: {
        name: "高二（3）班",
        grade: "高二",
        room: "401",
        teacher: "孟想",
      },
      summary: {
        studentCount: 24,
        maleCount: 14,
        femaleCount: 10,
        todoCount: 1,
      },
      workItems: [
        { id: "work-1", title: "填报体检表", priority: "HIGH" },
      ],
    });
    expect(mocks.studentGroupBy).toHaveBeenCalledTimes(1);
    expect(mocks.studentGroupBy).toHaveBeenCalledWith({
      by: ["gender"],
      where: { classId: "class-1", status: "ACTIVE" },
      _count: { _all: true },
    });
  });

  it("handles zero students correctly", async () => {
    mocks.studentGroupBy.mockResolvedValue([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.summary).toEqual({
      studentCount: 0,
      maleCount: 0,
      femaleCount: 0,
      todoCount: 1,
    });
  });

  it("rejects unauthorized access", async () => {
    mocks.requireAuthContext.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录"),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "登录已过期，请重新登录",
      },
    });
  });
});
