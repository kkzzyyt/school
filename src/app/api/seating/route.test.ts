import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: {
    classroom: { update: vi.fn() },
    seatAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
  },
  prisma: {
    classroom: { findUnique: vi.fn() },
    student: { findMany: vi.fn(), count: vi.fn() },
    seatAssignment: { findMany: vi.fn() },
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

const environment = {
  left: { windows: [1], doorRow: null },
  right: { windows: [], doorRow: 2 },
};

function putRequest(body: unknown) {
  return new Request("https://school.example/api/seating", {
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

describe("seating route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    mocks.prisma.classroom.findUnique.mockResolvedValue({ seatingEnvironment: null });
    mocks.prisma.student.count.mockResolvedValue(2);
    mocks.prisma.student.findMany.mockResolvedValue([]);
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([]);
    mocks.transaction.classroom.update.mockResolvedValue({ id: "class-1" });
    mocks.transaction.seatAssignment.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.seatAssignment.createMany.mockResolvedValue({ count: 0 });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("validates and atomically saves seating assignments with classroom environment markers", async () => {
    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [
          { studentId: "student-2", row: 2, column: 4 },
          { studentId: "student-1", row: 1, column: 1 },
        ],
        environment,
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        rows: 2,
        columns: 4,
        assignments: [
          { studentId: "student-1", row: 1, column: 1 },
          { studentId: "student-2", row: 2, column: 4 },
        ],
        environment,
      },
    });
    expect(mocks.prisma.student.count).toHaveBeenCalledWith({
      where: {
        id: { in: ["student-1", "student-2"] },
        classId: "class-1",
        status: "ACTIVE",
      },
    });
    expect(mocks.transaction.classroom.update).toHaveBeenCalledWith({
      where: { id: "class-1" },
      data: {
        seatRows: 2,
        seatColumns: 4,
        seatingEnvironment: environment,
      },
    });
    expect(mocks.transaction.seatAssignment.createMany).toHaveBeenCalledWith({
      data: [
        { studentId: "student-1", row: 1, column: 1, classId: "class-1" },
        { studentId: "student-2", row: 2, column: 4, classId: "class-1" },
      ],
    });
  });

  it.each([
    ["duplicate student", [
      { studentId: "student-1", row: 1, column: 1 },
      { studentId: "student-1", row: 2, column: 2 },
    ]],
    ["duplicate position", [
      { studentId: "student-1", row: 1, column: 1 },
      { studentId: "student-2", row: 1, column: 1 },
    ]],
  ])("rejects %s without partial writes", async (_caseName, assignments) => {
    const response = await PUT(
      putRequest({ rows: 2, columns: 4, assignments, environment }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.student.count).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an environment marker that overlaps or exceeds the row range", async () => {
    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [],
        environment: { left: { windows: [2], doorRow: 2 }, right: { windows: [], doorRow: 3 } },
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects students outside the authenticated class", async () => {
    mocks.prisma.student.count.mockResolvedValue(1);

    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [
          { studentId: "student-1", row: 1, column: 1 },
          { studentId: "student-other-class", row: 1, column: 2 },
        ],
        environment,
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(403);
    expect(body).toMatchObject({ success: false, error: { code: "FORBIDDEN" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("falls back to a safe environment when stored markers are invalid", async () => {
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatRows: 2,
      seatColumns: 4,
      seatingEnvironment: { left: { windows: [3], doorRow: null }, right: { windows: [], doorRow: null } },
    });
    mocks.prisma.student.findMany.mockResolvedValue([{ id: "student-1", name: "陈晨" }]);
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([]);

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        rows: 2,
        columns: 4,
        environment: {
          left: { windows: [], doorRow: null },
          right: { windows: [], doorRow: null },
        },
      },
    });
  });

  it("returns 401 before reading the database when the session is absent", async () => {
    mocks.requireAuthContext.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录"),
    );

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
    expect(mocks.prisma.classroom.findUnique).not.toHaveBeenCalled();
  });
});
