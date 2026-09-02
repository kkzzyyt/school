import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEATING_AISLE_AFTER_COLUMNS,
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ROWS,
  getSeatingAisleAfterColumns,
  isSeatingAisleAfterColumn,
  SeatingValidationError,
  swapStudentSeats,
  validateSeatingEnvironment,
  validateSeatingLayout,
} from "./seating";

describe("default seating dimensions", () => {
  it("uses the current classroom layout specification", () => {
    expect({
      rows: DEFAULT_SEATING_ROWS,
      columns: DEFAULT_SEATING_COLUMNS,
      aisleAfterColumns: DEFAULT_SEATING_AISLE_AFTER_COLUMNS,
    }).toEqual({ rows: 7, columns: 8, aisleAfterColumns: [2, 6] });
  });
});

describe("validateSeatingLayout", () => {
  it("accepts and orders a valid layout by row and column", () => {
    const result = validateSeatingLayout({
      rows: 3,
      columns: 4,
      assignments: [
        { studentId: "student-b", row: 2, column: 1 },
        { studentId: "student-a", row: 1, column: 4 },
      ],
    });

    expect(result.assignments).toEqual([
      { studentId: "student-a", row: 1, column: 4 },
      { studentId: "student-b", row: 2, column: 1 },
    ]);
  });

  it("rejects duplicate students", () => {
    expect(() =>
      validateSeatingLayout({
        rows: 3,
        columns: 4,
        assignments: [
          { studentId: "student-a", row: 1, column: 1 },
          { studentId: "student-a", row: 1, column: 2 },
        ],
      }),
    ).toThrowError(new SeatingValidationError("DUPLICATE_STUDENT"));
  });

  it("rejects duplicate positions", () => {
    expect(() =>
      validateSeatingLayout({
        rows: 3,
        columns: 4,
        assignments: [
          { studentId: "student-a", row: 1, column: 1 },
          { studentId: "student-b", row: 1, column: 1 },
        ],
      }),
    ).toThrowError(new SeatingValidationError("DUPLICATE_POSITION"));
  });

  it("rejects positions outside the configured layout", () => {
    expect(() =>
      validateSeatingLayout({
        rows: 3,
        columns: 4,
        assignments: [{ studentId: "student-a", row: 4, column: 1 }],
      }),
    ).toThrowError(new SeatingValidationError("POSITION_OUT_OF_BOUNDS"));
  });

  it("keeps aisle insertion independent from seat coordinates", () => {
    expect(validateSeatingLayout({
      rows: DEFAULT_SEATING_ROWS,
      columns: DEFAULT_SEATING_COLUMNS,
      assignments: [{ studentId: "student-a", row: 1, column: 3 }],
    }).assignments).toEqual([{ studentId: "student-a", row: 1, column: 3 }]);
  });

  it("rejects layouts outside supported dimensions", () => {
    expect(() =>
      validateSeatingLayout({ rows: 0, columns: 20, assignments: [] }),
    ).toThrowError(new SeatingValidationError("INVALID_DIMENSIONS"));
  });
});

describe("seating aisles", () => {
  it("inserts default aisles after seat columns without reducing the seat column count", () => {
    expect(DEFAULT_SEATING_AISLE_AFTER_COLUMNS).toEqual([2, 6]);
    expect(getSeatingAisleAfterColumns(10)).toEqual([2, 6]);
    expect(getSeatingAisleAfterColumns(8)).toEqual([2, 6]);
    expect(getSeatingAisleAfterColumns(6)).toEqual([3]);
    expect(isSeatingAisleAfterColumn(2, 10)).toBe(true);
    expect(isSeatingAisleAfterColumn(3, 10)).toBe(false);
    expect(isSeatingAisleAfterColumn(4, 6, [4])).toBe(true);
    expect(isSeatingAisleAfterColumn(3, 6, [4])).toBe(false);
  });
});

describe("validateSeatingEnvironment", () => {
  it("orders markers, allows two doors per side, and normalizes rear facilities", () => {
    expect(validateSeatingEnvironment({
      aisleAfterColumns: [5, 2],
      left: { windows: [4, 1], doorRows: [6, 3] },
      right: { windows: [3], doorRows: [2, 5] },
      rear: { waterDispenser: "LEFT", airConditioner: "RIGHT" },
    }, 2, 6)).toEqual({
      aisleAfterColumns: [2, 5],
      left: { windows: [1, 4], doorRows: [3, 6] },
      right: { windows: [3], doorRows: [2, 5] },
      rear: { waterDispenser: "LEFT", airConditioner: "RIGHT" },
    });
  });

  it("normalizes the legacy aisle and single-door fields", () => {
    expect(validateSeatingEnvironment({
      aisleColumns: [3, 8],
      left: { windows: [], doorRow: 7 },
      right: { windows: [], doorRow: null },
    }, 2, 10)).toEqual({
      aisleAfterColumns: [2, 6],
      left: { windows: [], doorRows: [7] },
      right: { windows: [], doorRows: [] },
      rear: { waterDispenser: null, airConditioner: null },
    });
  });

  it.each([
    { windows: [1, 1], doorRows: [] },
    { windows: [2], doorRows: [2] },
    { windows: [13], doorRows: [] },
    { windows: [1], doorRows: [0] },
    { windows: [], doorRows: [1, 2, 3] },
    { windows: [], doorRows: [1, 1] },
  ])("rejects invalid side markers: %o", (left) => {
    expect(() => validateSeatingEnvironment({
      left,
      right: { windows: [], doorRows: [] },
    }, 7)).toThrowError(new SeatingValidationError("INVALID_SIDE_FEATURES"));
  });

  it.each([
    ["duplicate aisle boundaries", [2, 2]],
    ["aisle before the first seat", [0]],
    ["aisle outside the supported seat range", [12]],
  ])("rejects %s", (_caseName, aisleAfterColumns) => {
    expect(() => validateSeatingEnvironment({
      aisleAfterColumns,
      left: { windows: [], doorRows: [] },
      right: { windows: [], doorRows: [] },
    }, 7, 8)).toThrowError(new SeatingValidationError("INVALID_AISLE_COLUMNS"));
  });

  it("rejects rear facilities placed at the same position", () => {
    expect(() => validateSeatingEnvironment({
      left: { windows: [], doorRows: [] },
      right: { windows: [], doorRows: [] },
      rear: { waterDispenser: "CENTER", airConditioner: "CENTER" },
    }, 7)).toThrowError(new SeatingValidationError("INVALID_REAR_FEATURES"));
  });

  it("preserves legacy markers beyond the fixed visible side rail", () => {
    expect(validateSeatingEnvironment({
      left: { windows: [8], doorRows: [9] },
      right: { windows: [], doorRows: [] },
    }, 7, undefined, { allowLegacySideRows: true })).toMatchObject({
      left: { windows: [8], doorRows: [9] },
    });
  });
});

describe("swapStudentSeats", () => {
  it("swaps two assigned students without mutating the source", () => {
    const assignments = [
      { studentId: "student-a", row: 1, column: 1 },
      { studentId: "student-b", row: 2, column: 2 },
    ];

    const result = swapStudentSeats(assignments, "student-a", "student-b");

    expect(result).toEqual([
      { studentId: "student-a", row: 2, column: 2 },
      { studentId: "student-b", row: 1, column: 1 },
    ]);
    expect(assignments[0]).toEqual({
      studentId: "student-a",
      row: 1,
      column: 1,
    });
  });

  it("returns the original values when either student is unassigned", () => {
    const assignments = [{ studentId: "student-a", row: 1, column: 1 }];

    expect(
      swapStudentSeats(assignments, "student-a", "student-missing"),
    ).toEqual(assignments);
  });
});
