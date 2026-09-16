import { describe, expect, it } from "vitest";

import {
  areSeatingSnapshotsEquivalent,
  buildHistoryAssignmentsSnapshot,
  calculateSeatingDiff,
  filterRestorableAssignments,
} from "./seating-history";

describe("domain/seating-history", () => {
  const mockStudents = [
    { id: "s1", name: "张三", studentNo: "001", gender: "MALE" as const },
    { id: "s2", name: "李四", studentNo: "002", gender: "FEMALE" as const },
    { id: "s3", name: "王五", studentNo: "003", gender: "MALE" as const },
  ];

  describe("buildHistoryAssignmentsSnapshot", () => {
    it("enriches assignments with student name, number, and gender", () => {
      const assignments = [
        { studentId: "s2", row: 2, column: 1 },
        { studentId: "s1", row: 1, column: 1 },
      ];

      const snapshot = buildHistoryAssignmentsSnapshot(assignments, mockStudents);

      expect(snapshot).toHaveLength(2);
      expect(snapshot[0]).toEqual({
        studentId: "s1",
        studentName: "张三",
        studentNo: "001",
        gender: "MALE",
        row: 1,
        column: 1,
      });
      expect(snapshot[1]).toEqual({
        studentId: "s2",
        studentName: "李四",
        studentNo: "002",
        gender: "FEMALE",
        row: 2,
        column: 1,
      });
    });

    it("handles students that may not exist in active student list gracefully", () => {
      const assignments = [{ studentId: "unknown", row: 1, column: 1 }];
      const snapshot = buildHistoryAssignmentsSnapshot(assignments, mockStudents);
      expect(snapshot[0].studentName).toBe("");
      expect(snapshot[0].studentNo).toBe("");
    });
  });

  describe("areSeatingSnapshotsEquivalent", () => {
    it("returns true for identical configurations regardless of assignment order", () => {
      const a = {
        rows: 7,
        columns: 8,
        assignments: [
          { studentId: "s1", row: 1, column: 1 },
          { studentId: "s2", row: 1, column: 2 },
        ],
        environment: { left: { windows: [1], doorRows: [] } },
      };
      const b = {
        rows: 7,
        columns: 8,
        assignments: [
          { studentId: "s2", row: 1, column: 2 },
          { studentId: "s1", row: 1, column: 1 },
        ],
        environment: { left: { windows: [1], doorRows: [] } },
      };
      expect(areSeatingSnapshotsEquivalent(a, b)).toBe(true);
    });

    it("returns false if rows or columns differ", () => {
      const a = { rows: 7, columns: 8, assignments: [] };
      const b = { rows: 6, columns: 8, assignments: [] };
      expect(areSeatingSnapshotsEquivalent(a, b)).toBe(false);
    });

    it("returns false if assignments differ", () => {
      const a = {
        rows: 7,
        columns: 8,
        assignments: [{ studentId: "s1", row: 1, column: 1 }],
      };
      const b = {
        rows: 7,
        columns: 8,
        assignments: [{ studentId: "s1", row: 1, column: 2 }],
      };
      expect(areSeatingSnapshotsEquivalent(a, b)).toBe(false);
    });
  });

  describe("filterRestorableAssignments", () => {
    it("filters out students who are no longer active in class", () => {
      const historyAssignments = [
        { studentId: "s1", studentName: "张三", studentNo: "001", row: 1, column: 1 },
        { studentId: "s-transferred", studentName: "赵六", studentNo: "004", row: 1, column: 2 },
      ];

      const activeStudents = [
        { id: "s1", name: "张三", studentNo: "001" },
        { id: "s2", name: "李四", studentNo: "002" },
      ];

      const result = filterRestorableAssignments(historyAssignments, activeStudents, 7, 8);

      expect(result.validAssignments).toEqual([{ studentId: "s1", row: 1, column: 1 }]);
      expect(result.skippedAssignments).toHaveLength(1);
      expect(result.skippedAssignments[0].studentId).toBe("s-transferred");
      expect(result.unassignedActiveStudents).toHaveLength(1);
      expect(result.unassignedActiveStudents[0].id).toBe("s2");
    });

    it("skips assignments out of current grid boundaries", () => {
      const historyAssignments = [
        { studentId: "s1", studentName: "张三", studentNo: "001", row: 8, column: 1 },
      ];
      const activeStudents = [{ id: "s1", name: "张三", studentNo: "001" }];

      const result = filterRestorableAssignments(historyAssignments, activeStudents, 7, 8);
      expect(result.validAssignments).toHaveLength(0);
      expect(result.skippedAssignments).toHaveLength(1);
    });
  });

  describe("calculateSeatingDiff", () => {
    it("calculates diff between current and history correctly", () => {
      const current = [
        { studentId: "s1", row: 1, column: 1 }, // same
        { studentId: "s2", row: 1, column: 2 }, // changed (was s3)
        { studentId: "s4", row: 2, column: 1 }, // removed in history
      ];
      const history = [
        { studentId: "s1", row: 1, column: 1 },
        { studentId: "s3", row: 1, column: 2 },
        { studentId: "s5", row: 2, column: 2 }, // new in history
      ];

      const diff = calculateSeatingDiff(current, history, 2, 2);

      expect(diff.get("1:1")).toBe("SAME");
      expect(diff.get("1:2")).toBe("MOVED");
      expect(diff.get("2:1")).toBe("REMOVED");
      expect(diff.get("2:2")).toBe("NEW");
    });
  });
});
