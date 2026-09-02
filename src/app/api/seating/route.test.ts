import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: {
    classroom: { updateMany: vi.fn() },
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
  aisleAfterColumns: [2],
  left: { windows: [1], doorRows: [2] },
  right: { windows: [], doorRows: [1, 2] },
  rear: { waterDispenser: "LEFT", airConditioner: "RIGHT" },
};
const revision = "2026-09-02T00:00:00.000Z";

function putRequest(body: unknown) {
  return new Request("https://school.example/api/seating", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? { revision, ...body }
        : body,
    ),
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
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatingEnvironment: null,
      seatColumns: 8,
      updatedAt: new Date(revision),
    });
    mocks.prisma.student.count.mockResolvedValue(2);
    mocks.prisma.student.findMany.mockResolvedValue([]);
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([]);
    mocks.transaction.classroom.updateMany.mockResolvedValue({ count: 1 });
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
    expect(mocks.transaction.classroom.updateMany).toHaveBeenCalledWith({
      where: { id: "class-1", updatedAt: new Date(revision) },
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

  it("rejects an environment marker that overlaps, exceeds the fixed side range, or exceeds two doors", async () => {
    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [],
        environment: {
          left: { windows: [2], doorRows: [2] },
          right: { windows: [], doorRows: [1, 2, 3] },
          rear: { waterDispenser: null, airConditioner: null },
        },
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects marker rows outside the fixed visible side rail", async () => {
    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [],
        environment: {
          ...environment,
          left: { windows: [8], doorRows: [] },
        },
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("preserves existing legacy side markers when saving a fresh seat revision", async () => {
    mocks.prisma.student.count.mockResolvedValue(0);
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatingEnvironment: {
        aisleAfterColumns: [2],
        left: { windows: [8], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: null, airConditioner: null },
      },
      seatColumns: 4,
      updatedAt: new Date(revision),
    });

    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [],
        environment: {
          aisleAfterColumns: [2],
          left: { windows: [8], doorRows: [] },
          right: { windows: [], doorRows: [] },
          rear: { waterDispenser: null, airConditioner: null },
        },
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { environment: { left: { windows: [8] } } } });
    expect(mocks.transaction.classroom.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        seatingEnvironment: expect.objectContaining({ left: expect.objectContaining({ windows: [8] }) }),
      }),
    }));
  });

  it("rejects rear facilities assigned to the same position", async () => {
    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [],
        environment: {
          ...environment,
          rear: { waterDispenser: "CENTER", airConditioner: "CENTER" },
        },
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("persists fixed facilities using row slots on sides and column slots on ends", async () => {
    mocks.prisma.student.count.mockResolvedValue(0);
    const fixedFacilities = {
      waterDispenser: { side: "LEFT", position: 2 },
      airConditioner: { side: "FRONT", position: 3 },
    };
    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [],
        environment: { ...environment, fixedFacilities },
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { environment: { fixedFacilities } } });
    expect(mocks.transaction.classroom.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ seatingEnvironment: expect.objectContaining({ fixedFacilities }) }),
    }));
  });

  it("allows seat assignments beside independently inserted aisles", async () => {
    mocks.prisma.student.count.mockResolvedValue(1);
    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [{ studentId: "student-1", row: 1, column: 2 }],
        environment,
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { assignments: [{ studentId: "student-1", row: 1, column: 2 }] } });
    expect(mocks.prisma.$transaction).toHaveBeenCalled();
  });

  it("rejects an outdated revision before replacing any assignments", async () => {
    mocks.transaction.classroom.updateMany.mockResolvedValue({ count: 0 });
    mocks.prisma.student.count.mockResolvedValue(0);

    const response = await PUT(
      putRequest({
        revision: "2026-08-01T00:00:00.000Z",
        rows: 2,
        columns: 4,
        assignments: [],
        environment,
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, error: { code: "STALE_WRITE" } });
    expect(mocks.transaction.seatAssignment.deleteMany).not.toHaveBeenCalled();
    expect(mocks.transaction.seatAssignment.createMany).not.toHaveBeenCalled();
  });

  it("rejects students outside the authenticated class", async () => {
    mocks.prisma.student.count.mockResolvedValue(1);

    const response = await PUT(
      putRequest({
        rows: 2,
        columns: 4,
        assignments: [
          { studentId: "student-1", row: 1, column: 1 },
          { studentId: "student-other-class", row: 1, column: 3 },
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
      seatingEnvironment: { left: { windows: [13], doorRow: null }, right: { windows: [], doorRow: null } },
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
        aisleAfterColumns: [2],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: null, airConditioner: null },
        },
      },
    });
  });

  it("normalizes legacy aisle and single-door fields returned from storage", async () => {
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatRows: 7,
      seatColumns: 10,
      seatingEnvironment: {
        aisleColumns: [3, 8],
        left: { windows: [1], doorRow: 7 },
        right: { windows: [], doorRow: null },
      },
    });
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([
      { studentId: "student-1", row: 1, column: 4 },
    ]);

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        columns: 8,
        assignments: [{ studentId: "student-1", row: 1, column: 3 }],
        environment: {
          aisleAfterColumns: [2, 6],
          left: { windows: [1], doorRows: [7] },
          right: { windows: [], doorRows: [] },
          rear: { waterDispenser: null, airConditioner: null },
        },
      },
    });
  });

  it("normalizes the former 10-slot default when its JSON only contains side markers", async () => {
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatRows: 7,
      seatColumns: 10,
      seatingEnvironment: {
        left: { windows: [1, 2, 3, 4, 5, 6], doorRow: null },
        right: { windows: [], doorRow: 7 },
      },
    });
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([
      { studentId: "student-1", row: 1, column: 4 },
    ]);

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        columns: 8,
        assignments: [{ studentId: "student-1", row: 1, column: 3 }],
        environment: {
          aisleAfterColumns: [2, 6],
          left: { windows: [1, 2, 3, 4, 5, 6], doorRows: [] },
          right: { windows: [], doorRows: [7] },
          rear: { waterDispenser: null, airConditioner: null },
        },
      },
    });
  });

  it("normalizes older non-default column counts without aisle JSON", async () => {
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatRows: 7,
      seatColumns: 6,
      seatingEnvironment: {
        left: { windows: [], doorRow: null },
        right: { windows: [], doorRow: null },
      },
    });
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([
      { studentId: "student-1", row: 1, column: 4 },
    ]);

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        columns: 5,
        assignments: [{ studentId: "student-1", row: 1, column: 3 }],
        environment: { aisleAfterColumns: [2] },
      },
    });
  });

  it("keeps converted aisle boundaries when an older non-default environment is absent", async () => {
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatRows: 7,
      seatColumns: 6,
      seatingEnvironment: null,
    });
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([
      { studentId: "student-1", row: 1, column: 4 },
    ]);

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        columns: 5,
        assignments: [{ studentId: "student-1", row: 1, column: 3 }],
        environment: { aisleAfterColumns: [2] },
      },
    });
  });

  it("keeps sparse current-format environments in their declared seat dimensions", async () => {
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatRows: 7,
      seatColumns: 8,
      seatingEnvironment: {
        aisleAfterColumns: [2, 6],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: null, airConditioner: null },
      },
    });
    mocks.prisma.seatAssignment.findMany.mockResolvedValue([
      { studentId: "student-1", row: 1, column: 3 },
    ]);

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        columns: 8,
        assignments: [{ studentId: "student-1", row: 1, column: 3 }],
        environment: { aisleAfterColumns: [2, 6] },
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
