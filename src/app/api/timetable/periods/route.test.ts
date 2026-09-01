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
  },
  prisma: {
    timetablePeriod: {
      aggregate: vi.fn(),
      create: vi.fn(),
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

import { GET, POST, PUT } from "./route";

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

function jsonRequest(body: unknown, method: "POST" | "PUT" = "POST") {
  return new Request("https://school.example/api/timetable/periods", {
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

describe("timetable period route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    mocks.prisma.timetablePeriod.aggregate.mockResolvedValue({
      _max: { period: 8, sortOrder: 7 },
    });
    mocks.prisma.timetablePeriod.create.mockResolvedValue({
      id: "period-early",
      classId: "class-1",
      period: 9,
      name: "早自习",
      type: "MORNING_STUDY",
      startTime: "07:20",
      endTime: "07:50",
      sortOrder: 8,
    });
    mocks.prisma.timetablePeriod.findMany.mockResolvedValue([
      { id: "period-1", period: 1, sortOrder: 0 },
      { id: "period-2", period: 2, sortOrder: 1 },
    ]);
    mocks.transaction.timetablePeriod.updateMany.mockResolvedValue({ count: 2 });
    mocks.transaction.timetablePeriod.update.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("creates a named special period with class-scoped ordering", async () => {
    const response = await POST(jsonRequest({
      name: "早自习",
      type: "MORNING_STUDY",
      startTime: "07:20",
      endTime: "07:50",
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { id: "period-early" } });
    expect(mocks.prisma.timetablePeriod.create).toHaveBeenCalledWith({
      data: {
        classId: "class-1",
        period: 9,
        name: "早自习",
        type: "MORNING_STUDY",
        startTime: "07:20",
        endTime: "07:50",
        sortOrder: 8,
      },
    });
  });

  it("rejects reversed or malformed times before a database write", async () => {
    const response = await POST(jsonRequest({
      name: "午休",
      type: "LUNCH_BREAK",
      startTime: "12:00",
      endTime: "11:59",
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.timetablePeriod.aggregate).not.toHaveBeenCalled();
    expect(mocks.prisma.timetablePeriod.create).not.toHaveBeenCalled();
  });

  it("atomically reorders the complete class period list", async () => {
    const existing = [{ id: "period-1" }, { id: "period-2" }];
    const reordered = [
      { id: "period-2", period: 2, sortOrder: 0 },
      { id: "period-1", period: 1, sortOrder: 1 },
    ];
    mocks.prisma.timetablePeriod.findMany
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(reordered);

    const response = await PUT(jsonRequest({
      periods: [
        { id: "period-2", sortOrder: 0 },
        { id: "period-1", sortOrder: 1 },
      ],
    }, "PUT"));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { periods: reordered } });
    expect(mocks.transaction.timetablePeriod.updateMany).toHaveBeenCalledWith({
      where: { classId: "class-1" },
      data: { sortOrder: { increment: 2_000_000 } },
    });
    expect(mocks.transaction.timetablePeriod.update).toHaveBeenNthCalledWith(1, {
      where: { id: "period-2" },
      data: { sortOrder: 0 },
    });
  });

  it("rejects incomplete or duplicate period orders without a transaction", async () => {
    const response = await PUT(jsonRequest({
      periods: [
        { id: "period-1", sortOrder: 0 },
        { id: "period-1", sortOrder: 0 },
      ],
    }, "PUT"));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns 401 before reading periods when unauthenticated", async () => {
    mocks.requireAuthContext.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录"),
    );

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
    expect(mocks.prisma.timetablePeriod.findMany).not.toHaveBeenCalled();
  });
});
