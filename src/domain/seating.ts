export interface SeatAssignment {
  studentId: string;
  row: number;
  column: number;
}

export const DEFAULT_SEATING_ROWS = 7;
// Eight seat columns are grouped as 2 | 4 | 2. The two aisles are rendered between them.
export const DEFAULT_SEATING_COLUMNS = 8;
export const DEFAULT_SEATING_AISLE_AFTER_COLUMNS: readonly number[] = [2, 6];
// Retained for consumers compiled against the earlier name. Values now mean insertion boundaries.
export const DEFAULT_SEATING_AISLE_COLUMNS = DEFAULT_SEATING_AISLE_AFTER_COLUMNS;
export const DEFAULT_SEATING_SIDE_MARKER_ROWS = 7;
export const MAX_DOORS_PER_SIDE = 2;
const MIN_SEAT_DIMENSION = 1;
const MAX_SEAT_DIMENSION = 12;

export interface SeatingSideLayout {
  windows: number[];
  doorRows: number[];
}

export interface SeatingSideLayoutInput {
  windows: number[];
  doorRows?: number[];
  // Legacy storage/API shape. It is normalized to doorRows on every read/write.
  doorRow?: number | null;
}

export const rearFacilityPositions = ["LEFT", "CENTER", "RIGHT"] as const;
export type RearFacilityPosition = (typeof rearFacilityPositions)[number];

export function getSeatingFixedFacilityColumn(
  position: RearFacilityPosition,
  columns: number,
): number {
  if (position === "LEFT") return 1;
  if (position === "RIGHT") return Math.max(1, columns);
  return Math.max(1, Math.ceil(columns / 2));
}

export function getSeatingGridTrackForColumn(
  column: number,
  aisleAfterColumns: readonly number[],
): number {
  return Math.max(1, column) + aisleAfterColumns.filter((aisle) => aisle < column).length;
}

export interface SeatingRearLayout {
  waterDispenser: RearFacilityPosition | null;
  airConditioner: RearFacilityPosition | null;
}

export interface SeatingRearLayoutInput {
  waterDispenser?: RearFacilityPosition | null;
  airConditioner?: RearFacilityPosition | null;
}

export const seatingFixedSides = ["LEFT", "RIGHT", "FRONT", "BACK"] as const;
export type SeatingFixedSide = (typeof seatingFixedSides)[number];

export interface SeatingFixedFacilityPlacement {
  side: SeatingFixedSide;
  position: number;
}

export interface SeatingFixedFacilities {
  waterDispenser: SeatingFixedFacilityPlacement | null;
  airConditioner: SeatingFixedFacilityPlacement | null;
}

export interface SeatingFixedFacilitiesInput {
  waterDispenser?: SeatingFixedFacilityPlacement | null;
  airConditioner?: SeatingFixedFacilityPlacement | null;
}

export function createFixedFacilitiesFromLegacyRear(
  rear: SeatingRearLayout,
  rows: number,
  columns: number,
): SeatingFixedFacilities {
  const row = Math.max(1, Math.ceil(rows / 2));
  const column = Math.max(1, Math.ceil(columns / 2));
  const placementFor = (position: RearFacilityPosition | null): SeatingFixedFacilityPlacement | null => {
    if (position === "LEFT") return { side: "LEFT", position: row };
    if (position === "RIGHT") return { side: "RIGHT", position: row };
    if (position === "CENTER") return { side: "BACK", position: column };
    return null;
  };
  return {
    waterDispenser: placementFor(rear.waterDispenser),
    airConditioner: placementFor(rear.airConditioner),
  };
}

export interface SeatingEnvironment {
  aisleAfterColumns: number[];
  left: SeatingSideLayout;
  right: SeatingSideLayout;
  rear: SeatingRearLayout;
  fixedFacilities?: SeatingFixedFacilities;
}

export interface SeatingEnvironmentInput {
  aisleAfterColumns?: number[];
  // Legacy occupied-grid aisle values. They are converted to insertion boundaries.
  aisleColumns?: number[];
  left: SeatingSideLayoutInput;
  right: SeatingSideLayoutInput;
  rear?: SeatingRearLayoutInput;
  fixedFacilities?: SeatingFixedFacilitiesInput;
}

export interface SeatingEnvironmentValidationOptions {
  allowLegacySideRows?: boolean;
}

export function getSeatingAisleAfterColumns(
  columns: number,
  configuredAfterColumns?: readonly number[],
): number[] {
  if (configuredAfterColumns) {
    return [...configuredAfterColumns]
      .filter((column) => column >= 1 && column < columns)
      .sort((left, right) => left - right);
  }
  if (!Number.isInteger(columns) || columns < MIN_SEAT_DIMENSION) {
    return [];
  }

  if (columns === DEFAULT_SEATING_COLUMNS) {
    return [...DEFAULT_SEATING_AISLE_AFTER_COLUMNS];
  }

  if (columns >= 8) {
    const firstAisle = Math.max(1, Math.floor(columns / 4));
    const secondAisle = Math.min(columns - 1, Math.floor(columns * 0.65));
    return firstAisle === secondAisle
      ? [firstAisle]
      : [firstAisle, secondAisle];
  }

  return columns >= 2 ? [Math.floor(columns / 2)] : [];
}

export const getSeatingAisleColumns = getSeatingAisleAfterColumns;

export function createDefaultSeatingEnvironment(
  columns = DEFAULT_SEATING_COLUMNS,
): SeatingEnvironment {
  return {
    aisleAfterColumns: getSeatingAisleAfterColumns(columns),
    left: { windows: [], doorRows: [] },
    right: { windows: [], doorRows: [] },
    rear: { waterDispenser: null, airConditioner: null },
  };
}

export const DEFAULT_SEATING_ENVIRONMENT = createDefaultSeatingEnvironment();

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
  | "INVALID_AISLE_COLUMNS"
  | "INVALID_SIDE_FEATURES"
  | "INVALID_REAR_FEATURES"
  | "INVALID_FIXED_FACILITIES";

export class SeatingValidationError extends Error {
  constructor(public readonly code: SeatingValidationCode) {
    super(code);
    this.name = "SeatingValidationError";
  }
}

export function isDefaultSeatingAisleAfterColumn(
  column: number,
  columns: number,
): boolean {
  return isSeatingAisleAfterColumn(column, columns);
}

export const isDefaultSeatingAisleColumn = isDefaultSeatingAisleAfterColumn;

export function isSeatingAisleAfterColumn(
  column: number,
  columns: number,
  configuredAfterColumns?: readonly number[],
): boolean {
  return getSeatingAisleAfterColumns(columns, configuredAfterColumns).includes(column);
}

export const isSeatingAisleColumn = isSeatingAisleAfterColumn;

function isRearFacilityPosition(value: unknown): value is RearFacilityPosition {
  return typeof value === "string" && rearFacilityPositions.includes(value as RearFacilityPosition);
}

function isSeatingFixedSide(value: unknown): value is SeatingFixedSide {
  return typeof value === "string" && seatingFixedSides.includes(value as SeatingFixedSide);
}

function normalizeFixedFacilityPlacement(
  placement: SeatingFixedFacilityPlacement | null | undefined,
  rows: number,
  columns: number | undefined,
): SeatingFixedFacilityPlacement | null {
  if (placement === null || placement === undefined) return null;
  const maxPosition = placement.side === "LEFT" || placement.side === "RIGHT"
    ? rows
    : columns ?? MAX_SEAT_DIMENSION;
  if (
    !isSeatingFixedSide(placement.side)
    || !Number.isInteger(placement.position)
    || placement.position < 1
    || placement.position > maxPosition
  ) {
    throw new SeatingValidationError("INVALID_FIXED_FACILITIES");
  }
  return {
    side: placement.side,
    position: placement.position,
  };
}

function sameFixedFacilitySlot(
  left: SeatingFixedFacilityPlacement | null,
  right: SeatingFixedFacilityPlacement | null,
) {
  return Boolean(
    left
    && right
    && left.side === right.side
    && left.position === right.position,
  );
}

function normalizeFixedFacilities(
  input: SeatingFixedFacilitiesInput | undefined,
  rows: number,
  columns: number | undefined,
): SeatingFixedFacilities | undefined {
  if (input === undefined) return undefined;
  const fixedFacilities = {
    waterDispenser: normalizeFixedFacilityPlacement(input.waterDispenser, rows, columns),
    airConditioner: normalizeFixedFacilityPlacement(input.airConditioner, rows, columns),
  };
  if (sameFixedFacilitySlot(fixedFacilities.waterDispenser, fixedFacilities.airConditioner)) {
    throw new SeatingValidationError("INVALID_FIXED_FACILITIES");
  }
  return fixedFacilities;
}

function normalizeLegacyAisleColumns(columns: readonly number[]): number[] {
  const sortedColumns = [...columns].sort((left, right) => left - right);
  if (
    new Set(sortedColumns).size !== sortedColumns.length
    || sortedColumns.some((column) => !Number.isInteger(column) || column < 2)
  ) {
    throw new SeatingValidationError("INVALID_AISLE_COLUMNS");
  }

  return sortedColumns.map((column, index) => column - index - 1);
}

export function validateSeatingEnvironment(
  environment: SeatingEnvironmentInput,
  rows: number,
  columns?: number,
  options: SeatingEnvironmentValidationOptions = {},
): SeatingEnvironment {
  const aisleAfterColumns = [...(
    environment.aisleAfterColumns
    ?? (environment.aisleColumns ? normalizeLegacyAisleColumns(environment.aisleColumns) : [])
  )].sort((left, right) => left - right);
  if (
    new Set(aisleAfterColumns).size !== aisleAfterColumns.length
    || aisleAfterColumns.some((column) => (
      !Number.isInteger(column) || column < 1 || column >= MAX_SEAT_DIMENSION
    ))
  ) {
    throw new SeatingValidationError("INVALID_AISLE_COLUMNS");
  }

  const normalizedSides = [environment.left, environment.right].map((side) => {
    const maxSideMarkerRow = options.allowLegacySideRows
      ? MAX_SEAT_DIMENSION
      : DEFAULT_SEATING_SIDE_MARKER_ROWS;
    const windows = [...side.windows].sort((left, right) => left - right);
    const uniqueWindows = new Set(windows);
    const doorRows = [...(
      side.doorRows
      ?? (side.doorRow === null || side.doorRow === undefined ? [] : [side.doorRow])
    )].sort((left, right) => left - right);
    const uniqueDoorRows = new Set(doorRows);

    if (
      uniqueWindows.size !== windows.length ||
      windows.some((row) => !Number.isInteger(row) || row < 1 || row > maxSideMarkerRow) ||
      doorRows.length > MAX_DOORS_PER_SIDE ||
      uniqueDoorRows.size !== doorRows.length ||
      doorRows.some((row) => !Number.isInteger(row) || row < 1 || row > maxSideMarkerRow) ||
      doorRows.some((row) => uniqueWindows.has(row))
    ) {
      throw new SeatingValidationError("INVALID_SIDE_FEATURES");
    }

    return {
      windows,
      doorRows,
    };
  });

  const rear: SeatingRearLayout = {
    waterDispenser: environment.rear?.waterDispenser ?? null,
    airConditioner: environment.rear?.airConditioner ?? null,
  };
  if (
    (rear.waterDispenser !== null && !isRearFacilityPosition(rear.waterDispenser))
    || (rear.airConditioner !== null && !isRearFacilityPosition(rear.airConditioner))
    || (rear.waterDispenser !== null && rear.waterDispenser === rear.airConditioner)
  ) {
    throw new SeatingValidationError("INVALID_REAR_FEATURES");
  }
  const fixedFacilities = normalizeFixedFacilities(environment.fixedFacilities, rows, columns);

  return {
    aisleAfterColumns,
    left: normalizedSides[0],
    right: normalizedSides[1],
    rear,
    ...(fixedFacilities === undefined ? {} : { fixedFacilities }),
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
