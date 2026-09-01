export interface SeatAssignment {
  studentId: string;
  row: number;
  column: number;
}

export const DEFAULT_SEATING_ROWS = 7;
export const DEFAULT_SEATING_COLUMNS = 10;
export const DEFAULT_SEATING_AISLE_COLUMNS: readonly number[] = [3, 8];

export interface SeatingSideLayout {
  windows: number[];
  doorRow: number | null;
}

export interface SeatingEnvironment {
  left: SeatingSideLayout;
  right: SeatingSideLayout;
}

export const DEFAULT_SEATING_ENVIRONMENT: SeatingEnvironment = {
  left: { windows: [], doorRow: null },
  right: { windows: [], doorRow: null },
};

export interface SeatingLayout {
  rows: number;
  columns: number;
  assignments: SeatAssignment[];
}

export type SeatingValidationCode =
  | "INVALID_DIMENSIONS"
  | "DUPLICATE_STUDENT"
  | "DUPLICATE_POSITION"
  | "POSITION_OUT_OF_BOUNDS"
  | "POSITION_IS_AISLE"
  | "INVALID_SIDE_FEATURES";

const MIN_SEAT_DIMENSION = 1;
const MAX_SEAT_DIMENSION = 12;

export class SeatingValidationError extends Error {
  constructor(public readonly code: SeatingValidationCode) {
    super(code);
    this.name = "SeatingValidationError";
  }
}

export function isDefaultSeatingAisleColumn(
  column: number,
  columns: number,
): boolean {
  return isSeatingAisleColumn(column, columns);
}

export function getSeatingAisleColumns(columns: number): number[] {
  if (!Number.isInteger(columns) || columns < MIN_SEAT_DIMENSION) {
    return [];
  }

  if (columns === DEFAULT_SEATING_COLUMNS) {
    return [...DEFAULT_SEATING_AISLE_COLUMNS];
  }

  if (columns >= 8) {
    const firstAisle = Math.max(2, Math.round(columns * 0.3));
    const secondAisle = Math.min(columns - 1, Math.round(columns * 0.8));
    return firstAisle === secondAisle
      ? [firstAisle]
      : [firstAisle, secondAisle];
  }

  return columns >= 5 ? [Math.ceil(columns / 2)] : [];
}

export function isSeatingAisleColumn(column: number, columns: number): boolean {
  return getSeatingAisleColumns(columns).includes(column);
}

export function validateSeatingEnvironment(
  environment: SeatingEnvironment,
  rows: number,
): SeatingEnvironment {
  const normalizedSides = [environment.left, environment.right].map((side) => {
    const windows = [...side.windows].sort((left, right) => left - right);
    const uniqueWindows = new Set(windows);

    if (
      uniqueWindows.size !== windows.length ||
      windows.some((row) => !Number.isInteger(row) || row < 1 || row > rows) ||
      (side.doorRow !== null &&
        (!Number.isInteger(side.doorRow) || side.doorRow < 1 || side.doorRow > rows)) ||
      (side.doorRow !== null && uniqueWindows.has(side.doorRow))
    ) {
      throw new SeatingValidationError("INVALID_SIDE_FEATURES");
    }

    return {
      windows,
      doorRow: side.doorRow,
    };
  });

  return {
    left: normalizedSides[0],
    right: normalizedSides[1],
  };
}

export function validateSeatingLayout(layout: SeatingLayout): SeatingLayout {
  if (
    !Number.isInteger(layout.rows) ||
    !Number.isInteger(layout.columns) ||
    layout.rows < MIN_SEAT_DIMENSION ||
    layout.columns < MIN_SEAT_DIMENSION ||
    layout.rows > MAX_SEAT_DIMENSION ||
    layout.columns > MAX_SEAT_DIMENSION
  ) {
    throw new SeatingValidationError("INVALID_DIMENSIONS");
  }

  const seenStudents = new Set<string>();
  const seenPositions = new Set<string>();

  for (const assignment of layout.assignments) {
    if (seenStudents.has(assignment.studentId)) {
      throw new SeatingValidationError("DUPLICATE_STUDENT");
    }

    if (
      !Number.isInteger(assignment.row) ||
      !Number.isInteger(assignment.column) ||
      assignment.row < 1 ||
      assignment.column < 1 ||
      assignment.row > layout.rows ||
      assignment.column > layout.columns
    ) {
      throw new SeatingValidationError("POSITION_OUT_OF_BOUNDS");
    }

    if (isSeatingAisleColumn(assignment.column, layout.columns)) {
      throw new SeatingValidationError("POSITION_IS_AISLE");
    }

    const positionKey = `${assignment.row}:${assignment.column}`;
    if (seenPositions.has(positionKey)) {
      throw new SeatingValidationError("DUPLICATE_POSITION");
    }

    seenStudents.add(assignment.studentId);
    seenPositions.add(positionKey);
  }

  return {
    rows: layout.rows,
    columns: layout.columns,
    assignments: [...layout.assignments].sort(
      (left, right) => left.row - right.row || left.column - right.column,
    ),
  };
}

export function swapStudentSeats(
  assignments: SeatAssignment[],
  firstStudentId: string,
  secondStudentId: string,
): SeatAssignment[] {
  const firstSeat = assignments.find(
    (assignment) => assignment.studentId === firstStudentId,
  );
  const secondSeat = assignments.find(
    (assignment) => assignment.studentId === secondStudentId,
  );

  if (!firstSeat || !secondSeat) {
    return [...assignments];
  }

  return assignments.map((assignment) => {
    if (assignment.studentId === firstStudentId) {
      return { ...assignment, row: secondSeat.row, column: secondSeat.column };
    }

    if (assignment.studentId === secondStudentId) {
      return { ...assignment, row: firstSeat.row, column: firstSeat.column };
    }

    return { ...assignment };
  });
}
