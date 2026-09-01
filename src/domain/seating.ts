export interface SeatAssignment {
  studentId: string;
  row: number;
  column: number;
}

export interface SeatingLayout {
  rows: number;
  columns: number;
  assignments: SeatAssignment[];
}

export type SeatingValidationCode =
  | "INVALID_DIMENSIONS"
  | "DUPLICATE_STUDENT"
  | "DUPLICATE_POSITION"
  | "POSITION_OUT_OF_BOUNDS";

const MIN_SEAT_DIMENSION = 1;
const MAX_SEAT_DIMENSION = 12;

export class SeatingValidationError extends Error {
  constructor(public readonly code: SeatingValidationCode) {
    super(code);
    this.name = "SeatingValidationError";
  }
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
