import { describe, expect, it } from "vitest";

import {
  DEFAULT_SEATING_AISLE_COLUMNS,
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ROWS,
  SeatingValidationError,
  swapStudentSeats,
  validateSeatingLayout,
} from "./seating";

describe("default seating dimensions", () => {
  it("uses the current classroom layout specification", () => {
    expect({
      rows: DEFAULT_SEATING_ROWS,
      columns: DEFAULT_SEATING_COLUMNS,
      aisleColumns: DEFAULT_SEATING_AISLE_COLUMNS,
    }).toEqual({ rows: 7, columns: 10, aisleColumns: [3, 8] });
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

  it("rejects assignments placed in a default aisle column", () => {
    expect(() =>
      validateSeatingLayout({
        rows: DEFAULT_SEATING_ROWS,
        columns: DEFAULT_SEATING_COLUMNS,
        assignments: [{ studentId: "student-a", row: 1, column: 3 }],
      }),
    ).toThrowError(new SeatingValidationError("POSITION_IS_AISLE"));
  });

  it("rejects layouts outside supported dimensions", () => {
    expect(() =>
      validateSeatingLayout({ rows: 0, columns: 20, assignments: [] }),
    ).toThrowError(new SeatingValidationError("INVALID_DIMENSIONS"));
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
