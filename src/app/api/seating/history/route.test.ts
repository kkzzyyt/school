import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: {
    classroom: { update: vi.fn() },
    seatAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
    seatingHistory: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  },
  prisma: {
    classroom: { update: vi.fn() },
    student: { findMany: vi.fn() },
    seatingHistory: { findMany: vi.fn(), findFirst: vi.fn(), delete: vi.fn() },
    seatAssignment: { deleteMany: vi.fn(), createMany: vi.fn() },
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

import { GET as getHistoryList } from "./route";
import { GET as getHistoryDetail, DELETE as deleteHistory } from "./[id]/route";
import { POST as restoreHistory } from "./[id]/restore/route";

const authContext = {
  userId: "user-1",
  username: "teacher",
  displayName: "周老师",
  userRole: "HEAD_TEACHER" as const,
  classId: "class-1",
  className: "高二（3）班",
  grade: "高二",
  room: "302",
};

describe("api/seating/history routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.transaction) => Promise<unknown>) => {
      return callback(mocks.transaction);
    });
    mocks.transaction.classroom.update.mockResolvedValue({ id: "class-1" });
    mocks.transaction.seatAssignment.deleteMany.mockResolvedValue({ count: 10 });
    mocks.transaction.seatAssignment.createMany.mockResolvedValue({ count: 2 });
    mocks.transaction.seatingHistory.create.mockResolvedValue({ id: "hist-new" });
    mocks.transaction.seatingHistory.findMany.mockResolvedValue([]);
    mocks.transaction.seatingHistory.deleteMany.mockResolvedValue({ count: 0 });
  });

  describe("GET /api/seating/history", () => {
    it("returns history summary list for current class ordered by createdAt desc", async () => {
      const now = new Date("2026-09-16T08:00:00.000Z");
      mocks.prisma.seatingHistory.findMany.mockResolvedValue([
        {
          id: "hist-1",
          classId: "class-1",
          operatorId: "user-1",
          operatorName: "周老师",
          triggerType: "MANUAL",
          description: "微调座位",
          rows: 7,
          columns: 8,
          studentCount: 45,
          createdAt: now,
        },
      ]);

      const response = await getHistoryList();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.histories).toHaveLength(1);
      expect(data.data.histories[0]).toEqual({
        id: "hist-1",
        classId: "class-1",
        operatorId: "user-1",
        operatorName: "周老师",
        triggerType: "MANUAL",
        description: "微调座位",
        rows: 7,
        columns: 8,
        studentCount: 45,
        createdAt: now.toISOString(),
      });
      expect(mocks.prisma.seatingHistory.findMany).toHaveBeenCalledWith({
        where: { classId: "class-1" },
        orderBy: { createdAt: "desc" },
        take: 12,
        select: expect.any(Object),
      });
    });
  });

  describe("GET /api/seating/history/[id]", () => {
    it("returns 404 when history record is not found", async () => {
      mocks.prisma.seatingHistory.findFirst.mockResolvedValue(null);

      const response = await getHistoryDetail(
        new Request("https://school.example/api/seating/history/not-exist"),
        { params: Promise.resolve({ id: "not-exist" }) },
      );

      expect(response.status).toBe(404);
    });

    it("returns full snapshot details when record exists", async () => {
      const record = {
        id: "hist-1",
        classId: "class-1",
        operatorId: "user-1",
        operatorName: "周老师",
        triggerType: "ROTATION",
        description: "大组轮转",
        rows: 7,
        columns: 8,
        studentCount: 2,
        assignments: [
          { studentId: "s1", studentName: "张三", studentNo: "001", row: 1, column: 1 },
          { studentId: "s2", studentName: "李四", studentNo: "002", row: 1, column: 2 },
        ],
        environment: {
          aisleAfterColumns: [2, 6],
          left: { windows: [1], doorRows: [] },
          right: { windows: [], doorRows: [1] },
          rear: { waterDispenser: null, airConditioner: null },
        },
        createdAt: new Date("2026-09-16T08:00:00.000Z"),
      };
      mocks.prisma.seatingHistory.findFirst.mockResolvedValue(record);

      const response = await getHistoryDetail(
        new Request("https://school.example/api/seating/history/hist-1"),
        { params: Promise.resolve({ id: "hist-1" }) },
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.id).toBe("hist-1");
      expect(data.data.assignments).toHaveLength(2);
      expect(data.data.environment.aisleAfterColumns).toEqual([2, 6]);
    });
  });

  describe("POST /api/seating/history/[id]/restore", () => {
    it("restores historical seating, filters out transferred students, and creates RESTORE entry", async () => {
      const historyRecord = {
        id: "hist-target",
        classId: "class-1",
        operatorId: "user-1",
        operatorName: "周老师",
        triggerType: "MANUAL",
        description: "周五微调",
        rows: 7,
        columns: 8,
        assignments: [
          { studentId: "s1", studentName: "张三", studentNo: "001", row: 1, column: 1 },
          { studentId: "s-transferred", studentName: "赵六", studentNo: "003", row: 1, column: 2 },
        ],
        environment: { aisleAfterColumns: [2, 6] },
        createdAt: new Date("2026-09-10T10:00:00.000Z"),
      };
      mocks.prisma.seatingHistory.findFirst.mockResolvedValue(historyRecord);

      // Only s1 is currently ACTIVE in class-1
      mocks.prisma.student.findMany.mockResolvedValue([
        { id: "s1", name: "张三", studentNo: "001", gender: "MALE" },
      ]);

      const response = await restoreHistory(
        new Request("https://school.example/api/seating/history/hist-target/restore", {
          method: "POST",
        }),
        { params: Promise.resolve({ id: "hist-target" }) },
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data.restoredCount).toBe(1);
      expect(data.data.skippedStudents).toEqual([
        { studentId: "s-transferred", studentName: "赵六" },
      ]);
      expect(mocks.transaction.classroom.update).toHaveBeenCalledWith({
        where: { id: "class-1" },
        data: {
          seatRows: 7,
          seatColumns: 8,
          seatingEnvironment: { aisleAfterColumns: [2, 6] },
        },
      });
      expect(mocks.transaction.seatAssignment.createMany).toHaveBeenCalledWith({
        data: [{ studentId: "s1", row: 1, column: 1, classId: "class-1" }],
      });
      expect(mocks.transaction.seatingHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          classId: "class-1",
          triggerType: "RESTORE",
          studentCount: 1,
        }),
      });
    });

    it("prunes excess records if total exceeds MAX_SEATING_HISTORY_COUNT", async () => {
      const historyRecord = {
        id: "hist-target",
        classId: "class-1",
        rows: 7,
        columns: 8,
        assignments: [],
        environment: null,
        createdAt: new Date(),
      };
      mocks.prisma.seatingHistory.findFirst.mockResolvedValue(historyRecord);
      mocks.prisma.student.findMany.mockResolvedValue([]);

      mocks.transaction.seatingHistory.findMany.mockResolvedValue([
        { id: "old-1" },
        { id: "old-2" },
      ]);

      const response = await restoreHistory(
        new Request("https://school.example/api/seating/history/hist-target/restore", {
          method: "POST",
        }),
        { params: Promise.resolve({ id: "hist-target" }) },
      );

      expect(response.status).toBe(200);
      expect(mocks.transaction.seatingHistory.deleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["old-1", "old-2"] } },
      });
    });
  });

  describe("DELETE /api/seating/history/[id]", () => {
    it("deletes a non-latest history record belonging to the current class", async () => {
      // 1st call: find record to delete (hist-2); 2nd call: find latest record (hist-1)
      mocks.prisma.seatingHistory.findFirst
        .mockResolvedValueOnce({ id: "hist-2" })
        .mockResolvedValueOnce({ id: "hist-1" });
      mocks.prisma.seatingHistory.delete.mockResolvedValue({ id: "hist-2" });

      const response = await deleteHistory(
        new Request("https://school.example/api/seating/history/hist-2", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "hist-2" }) },
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toEqual({ success: true });
      expect(mocks.prisma.seatingHistory.delete).toHaveBeenCalledWith({
        where: { id: "hist-2" },
      });
    });

    it("returns 400 when attempting to delete the latest active history record", async () => {
      // Both target and latest are hist-1
      mocks.prisma.seatingHistory.findFirst
        .mockResolvedValueOnce({ id: "hist-1" })
        .mockResolvedValueOnce({ id: "hist-1" });

      const response = await deleteHistory(
        new Request("https://school.example/api/seating/history/hist-1", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "hist-1" }) },
      );
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error.message).toContain("当前最新的生效座次记录无法删除");
      expect(mocks.prisma.seatingHistory.delete).not.toHaveBeenCalled();
    });

    it("returns 404 when trying to delete non-existent or other class history record", async () => {
      mocks.prisma.seatingHistory.findFirst.mockResolvedValue(null);

      const response = await deleteHistory(
        new Request("https://school.example/api/seating/history/not-exist", {
          method: "DELETE",
        }),
        { params: Promise.resolve({ id: "not-exist" }) },
      );

      expect(response.status).toBe(404);
      expect(mocks.prisma.seatingHistory.delete).not.toHaveBeenCalled();
    });
  });
});
