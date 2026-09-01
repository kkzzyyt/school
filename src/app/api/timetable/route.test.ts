import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: {
    timetablePeriod: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    timetableEntry: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
  prisma: {
    course: {
      findMany: vi.fn(),
    },
    teacher: { findMany: vi.fn() },
    timetablePeriod: { findMany: vi.fn() },
    timetableEntry: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));
vi.mock("@/server/auth/origin", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
}));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { GET, PUT } from "./route";

const authContext = {
  userId: "user-1",
  username: "teacher",
  displayName: "周老师",
  userRole: "HEAD_TEACHER" as const,
  classId: "class-1",
  className: "高二（3）班",
  grade: "高二",
  room: "致远楼 302",
};

function putRequest(body: unknown) {
  return new Request("https://school.example/api/timetable", {
    method: "PUT",
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

const validEntries = [
  {
    courseId: "course-chinese",
    weekday: 1,
    period: 1,
    teacherName: " 王老师 ",
    room: "致远楼 302",
  },
  {
    courseId: "course-math",
    weekday: 1,
    period: 2,
    teacherName: null,
    room: null,
  },
];

describe("timetable route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    mocks.prisma.course.findMany.mockResolvedValue([
      { id: "course-chinese" },
      { id: "course-math" },
    ]);
    mocks.prisma.teacher.findMany.mockResolvedValue([
      { id: "teacher-chinese", name: "王老师" },
    ]);
    mocks.prisma.timetablePeriod.findMany.mockResolvedValue([
      { id: "period-1", period: 1 },
      { id: "period-2", period: 2 },
    ]);
    mocks.prisma.timetableEntry.findMany.mockResolvedValue([]);
    mocks.transaction.timetablePeriod.updateMany.mockResolvedValue({ count: 0 });
    mocks.transaction.timetablePeriod.update.mockResolvedValue({});
    mocks.transaction.timetableEntry.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.timetableEntry.createMany.mockResolvedValue({ count: 0 });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("atomically replaces only the authenticated class timetable", async () => {
    const response = await PUT(putRequest({ entries: validEntries }));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { count: 2 } });
    expect(mocks.prisma.course.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["course-chinese", "course-math"] } },
      select: { id: true },
    });
    expect(mocks.transaction.timetableEntry.deleteMany).toHaveBeenCalledWith({
      where: { classId: "class-1" },
    });
    expect(mocks.transaction.timetableEntry.createMany).toHaveBeenCalledWith({
      data: [
        {
          courseId: "course-chinese",
          weekday: 1,
          period: 1,
          periodId: "period-1",
          teacherId: "teacher-chinese",
          teacherName: "王老师",
          room: "致远楼 302",
          classId: "class-1",
        },
        {
          courseId: "course-math",
          weekday: 1,
          period: 2,
          periodId: "period-2",
          teacherId: null,
          teacherName: null,
          room: null,
          classId: "class-1",
        },
      ],
    });
  });

  it.each([
    ["weekday below range", { weekday: 0, period: 1 }],
    ["weekday above range", { weekday: 8, period: 1 }],
    ["period below range", { weekday: 1, period: 0 }],
    ["period above API range", { weekday: 1, period: 1001 }],
  ])("rejects %s before opening a transaction", async (_caseName, position) => {
    const response = await PUT(
      putRequest({ entries: [{ courseId: "course-chinese", ...position }] }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.course.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects two entries assigned to the same weekday and period", async () => {
    const response = await PUT(
      putRequest({
        entries: [
          { courseId: "course-chinese", weekday: 1, period: 1 },
          { courseId: "course-math", weekday: 1, period: 1 },
        ],
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "同一节次只能安排一门课程" },
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects unknown courses without deleting existing rows", async () => {
    mocks.prisma.course.findMany.mockResolvedValue([{ id: "course-chinese" }]);

    const response = await PUT(
      putRequest({
        entries: [
          { courseId: "course-chinese", weekday: 1, period: 1 },
          { courseId: "course-missing", weekday: 1, period: 2 },
        ],
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "课表中包含无效课程" },
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 401 without querying courses for an unauthenticated write", async () => {
    mocks.requireAuthContext.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录"),
    );

    const response = await PUT(putRequest({ entries: [] }));
    const body = await responseBody(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
    expect(mocks.prisma.course.findMany).not.toHaveBeenCalled();
  });

  it("scopes GET entries to the authenticated class", async () => {
    const courses = [{ id: "course-chinese", name: "语文", color: "#4f6f52" }];
    const entries = [{ id: "entry-1", classId: "class-1", weekday: 1, period: 1 }];
    mocks.prisma.course.findMany.mockResolvedValue(courses);
    mocks.prisma.timetableEntry.findMany.mockResolvedValue(entries);

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { courses, entries } });
    expect(mocks.prisma.timetableEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classId: "class-1" },
    }));
  });

  it.todo("accepts named periods with explicit start/end times for early study, lunch break, and evening study");
  it.todo("supports teacher resource CRUD and timetable entries referencing a maintained teacher");
  it.todo("persists a drag-and-drop timetable move with the same atomic replace contract");
});
