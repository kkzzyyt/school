import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  prisma: { seatingHistory: { findMany: vi.fn() } },
}));

vi.mock("@/server/auth/context", () => ({ requireAuthContext: mocks.requireAuthContext }));
vi.mock("@/server/auth/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { POST } from "./route";
import { DEFAULT_ROTATION_SCHEME, rotateSeatAssignments } from "@/domain/seating-rotation";

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

const assignments = [
  { studentId: "s-1", row: 1, column: 1 },
  { studentId: "s-2", row: 1, column: 2 },
  { studentId: "s-3", row: 3, column: 4 },
];

function request(body: unknown = {}) {
  return new Request("https://school.example/api/seating/imports/infer", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/seating/imports/infer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    const rotated = rotateSeatAssignments(assignments, 3, 4, DEFAULT_ROTATION_SCHEME).newAssignments;
    mocks.prisma.seatingHistory.findMany.mockResolvedValue([
      { id: "h-2", rows: 3, columns: 4, assignments: rotated, createdAt: new Date("2026-09-02") },
      { id: "h-1", rows: 3, columns: 4, assignments, createdAt: new Date("2026-09-01") },
    ]);
  });

  it("uses current-class history and returns ranked explainable candidates", async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        snapshotCount: 2,
      },
    });
    expect(body.data.candidates[0]).toMatchObject({
      ruleId: DEFAULT_ROTATION_SCHEME.id,
      confidence: 1,
    });
    expect(mocks.prisma.seatingHistory.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { classId: "class-1" },
      orderBy: { createdAt: "desc" },
      take: 6,
    }));
  });

  it("returns no stable recommendation when there are not enough snapshots", async () => {
    mocks.prisma.seatingHistory.findMany.mockResolvedValue([
      { id: "h-1", rows: 3, columns: 4, assignments, createdAt: new Date("2026-09-01") },
    ]);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { snapshotCount: 1, candidates: [] } });
  });
});
