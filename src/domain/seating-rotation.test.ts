import { describe, expect, it } from "vitest";
import {
  calculateColumnShift,
  calculateRowShift,
  DEFAULT_ROTATION_SCHEME,
  PRESET_ROTATION_SCHEMES,
  rotateSeatAssignments,
  seatKey,
} from "./seating-rotation";
import type { SeatAssignment } from "./seating";

describe("seating-rotation domain engine", () => {
  describe("calculateRowShift", () => {
    it("shifts rows backward by step 1 and wraps around", () => {
      expect(calculateRowShift(1, 7, "BACKWARD", 1)).toBe(2);
      expect(calculateRowShift(2, 7, "BACKWARD", 1)).toBe(3);
      expect(calculateRowShift(6, 7, "BACKWARD", 1)).toBe(7);
      expect(calculateRowShift(7, 7, "BACKWARD", 1)).toBe(1);
    });

    it("shifts rows forward by step 1 and wraps around", () => {
      expect(calculateRowShift(2, 7, "FORWARD", 1)).toBe(1);
      expect(calculateRowShift(1, 7, "FORWARD", 1)).toBe(7);
      expect(calculateRowShift(7, 7, "FORWARD", 1)).toBe(6);
    });

    it("mirrors rows", () => {
      expect(calculateRowShift(1, 7, "MIRROR", 1)).toBe(7);
      expect(calculateRowShift(4, 7, "MIRROR", 1)).toBe(4);
      expect(calculateRowShift(7, 7, "MIRROR", 1)).toBe(1);
    });

    it("preserves row when direction is NONE", () => {
      expect(calculateRowShift(3, 7, "NONE", 1)).toBe(3);
    });
  });

  describe("calculateColumnShift", () => {
    it("performs outer-to-inner swap for 8 columns in pairs of 2", () => {
      // Group 0 [1, 2] <-> Group 1 [3, 4]
      expect(calculateColumnShift(1, 8, "OUTER_TO_INNER", 2)).toBe(3);
      expect(calculateColumnShift(2, 8, "OUTER_TO_INNER", 2)).toBe(4);
      expect(calculateColumnShift(3, 8, "OUTER_TO_INNER", 2)).toBe(1);
      expect(calculateColumnShift(4, 8, "OUTER_TO_INNER", 2)).toBe(2);

      // Group 3 [7, 8] <-> Group 2 [5, 6]
      expect(calculateColumnShift(5, 8, "OUTER_TO_INNER", 2)).toBe(7);
      expect(calculateColumnShift(6, 8, "OUTER_TO_INNER", 2)).toBe(8);
      expect(calculateColumnShift(7, 8, "OUTER_TO_INNER", 2)).toBe(5);
      expect(calculateColumnShift(8, 8, "OUTER_TO_INNER", 2)).toBe(6);
    });

    it("performs group cycle right", () => {
      // 1,2 -> 3,4; 3,4 -> 5,6; 5,6 -> 7,8; 7,8 -> 1,2
      expect(calculateColumnShift(1, 8, "GROUP_CYCLE_RIGHT", 2)).toBe(3);
      expect(calculateColumnShift(3, 8, "GROUP_CYCLE_RIGHT", 2)).toBe(5);
      expect(calculateColumnShift(5, 8, "GROUP_CYCLE_RIGHT", 2)).toBe(7);
      expect(calculateColumnShift(7, 8, "GROUP_CYCLE_RIGHT", 2)).toBe(1);
    });

    it("mirrors columns symmetrically", () => {
      expect(calculateColumnShift(1, 8, "COLUMN_MIRROR")).toBe(8);
      expect(calculateColumnShift(2, 8, "COLUMN_MIRROR")).toBe(7);
      expect(calculateColumnShift(8, 8, "COLUMN_MIRROR")).toBe(1);
    });
  });

  describe("rotateSeatAssignments", () => {
    const mockAssignments: SeatAssignment[] = [
      { studentId: "s1", row: 1, column: 1 },
      { studentId: "s2", row: 1, column: 2 },
      { studentId: "s3", row: 1, column: 3 },
      { studentId: "s4", row: 1, column: 4 },
      { studentId: "s5", row: 1, column: 7 },
      { studentId: "s6", row: 1, column: 8 },
      { studentId: "s7", row: 7, column: 1 },
    ];

    it("rotates assignments correctly under the default scheme", () => {
      const result = rotateSeatAssignments(mockAssignments, 7, 8, DEFAULT_ROTATION_SCHEME);
      expect(result.movedCount).toBe(mockAssignments.length);
      expect(result.lockedCount).toBe(0);

      // (1, 1) -> row 2, col 3
      const s1 = result.newAssignments.find((a) => a.studentId === "s1");
      expect(s1).toEqual({ studentId: "s1", row: 2, column: 3 });

      // (1, 3) -> row 2, col 1
      const s3 = result.newAssignments.find((a) => a.studentId === "s3");
      expect(s3).toEqual({ studentId: "s3", row: 2, column: 1 });

      // (7, 1) -> row 1, col 3 (wrapped row)
      const s7 = result.newAssignments.find((a) => a.studentId === "s7");
      expect(s7).toEqual({ studentId: "s7", row: 1, column: 3 });
    });

    it("respects locked seats and prevents collision", () => {
      // 锁定 s1 在 (1, 1)
      const locked = new Set([seatKey(1, 1)]);
      const result = rotateSeatAssignments(mockAssignments, 7, 8, DEFAULT_ROTATION_SCHEME, locked);

      expect(result.lockedCount).toBe(1);

      // s1 应该留在 (1, 1)
      const s1 = result.newAssignments.find((a) => a.studentId === "s1");
      expect(s1).toEqual({ studentId: "s1", row: 1, column: 1 });

      // 确保没有任何两人占据同一个位置
      const occupiedPositions = new Set(result.newAssignments.map((a) => `${a.row}-${a.column}`));
      expect(occupiedPositions.size).toBe(mockAssignments.length);
    });

    it("respects disabled seats and does not place students into removed seats", () => {
      const disabled = new Set([seatKey(2, 3)]);
      const result = rotateSeatAssignments(
        mockAssignments,
        7,
        8,
        DEFAULT_ROTATION_SCHEME,
        new Set(),
        disabled,
      );

      const inDisabled = result.newAssignments.some((a) => a.row === 2 && a.column === 3);
      expect(inDisabled).toBe(false);

      const occupiedPositions = new Set(result.newAssignments.map((a) => `${a.row}-${a.column}`));
      expect(occupiedPositions.size).toBe(mockAssignments.length);
    });
  });
});
