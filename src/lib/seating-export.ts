import {
  createFixedFacilitiesFromLegacyRear,
  getSeatingAisleAfterColumns,
  type SeatingEnvironment,
  type SeatingFixedFacilityPlacement,
} from "@/domain/seating";

export interface SeatingExportStudent {
  id: string;
  name: string;
  studentNo: string;
}

export interface SeatingExportAssignment {
  studentId: string;
  row: number;
  column: number;
}

export interface SeatingExportInput {
  className?: string;
  rows: number;
  columns: number;
  students: readonly SeatingExportStudent[];
  assignments: readonly SeatingExportAssignment[];
  environment?: SeatingEnvironment;
  podiumPosition?: "TOP" | "BOTTOM";
  mirrorColumns?: boolean;
}

export type SeatingExportTrack =
  | { type: "SEAT"; seatColumn: number }
  | { type: "AISLE"; afterColumn: number };

export interface SeatingExportRosterRow {
  排: number | "";
  座: number | "";
  姓名: string;
  状态: "已安排" | "未分配";
}

function normalizeDimension(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

function safeCellText(value: string) {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function emptyCells(count: number) {
  return Array.from({ length: Math.max(0, count) }, () => "");
}

function createIndexes(input: SeatingExportInput) {
  const rows = normalizeDimension(input.rows);
  const columns = normalizeDimension(input.columns);
  const studentById = new Map(input.students.map((student) => [student.id, student]));
  const assignmentByPosition = new Map<string, SeatingExportAssignment>();
  const assignmentByStudent = new Map<string, SeatingExportAssignment>();

  for (const assignment of input.assignments) {
    if (
      !Number.isInteger(assignment.row)
      || !Number.isInteger(assignment.column)
      || assignment.row < 1
      || assignment.row > rows
      || assignment.column < 1
      || assignment.column > columns
    ) {
      continue;
    }
    const positionKey = `${assignment.row}-${assignment.column}`;
    if (!assignmentByPosition.has(positionKey)) assignmentByPosition.set(positionKey, assignment);
    if (!assignmentByStudent.has(assignment.studentId)) assignmentByStudent.set(assignment.studentId, assignment);
  }

  return { rows, columns, studentById, assignmentByPosition, assignmentByStudent };
}

export function getSeatingExportTracks(
  input: Pick<SeatingExportInput, "columns" | "environment">,
): SeatingExportTrack[] {
  const columns = normalizeDimension(input.columns);
  const aisleAfterColumns = input.environment
    ? [...new Set(getSeatingAisleAfterColumns(columns, input.environment.aisleAfterColumns))]
    : [];
  const tracks: SeatingExportTrack[] = [];

  for (let column = 1; column <= columns; column += 1) {
    tracks.push({ type: "SEAT", seatColumn: column });
    if (aisleAfterColumns.includes(column)) tracks.push({ type: "AISLE", afterColumn: column });
  }

  return tracks;
}

function seatValue(
  row: number,
  column: number,
  assignmentByPosition: ReadonlyMap<string, SeatingExportAssignment>,
  studentById: ReadonlyMap<string, SeatingExportStudent>,
) {
  const assignment = assignmentByPosition.get(`${row}-${column}`);
  const student = assignment ? studentById.get(assignment.studentId) : undefined;
  return student ? safeCellText(student.name) : assignment ? "未知学生" : "";
}

interface SeatingExportFacility {
  label: string;
  placement: SeatingFixedFacilityPlacement;
}

function getFixedFacilities(environment: SeatingEnvironment, rows: number, columns: number) {
  const fixedFacilities = environment.fixedFacilities
    ?? createFixedFacilitiesFromLegacyRear(environment.rear, rows, columns);
  return [
    { label: "饮水机", placement: fixedFacilities.waterDispenser },
    { label: "空调", placement: fixedFacilities.airConditioner },
  ].filter((facility): facility is SeatingExportFacility => facility.placement !== null);
}

function sideMarker(
  environment: SeatingEnvironment,
  facilities: readonly SeatingExportFacility[],
  side: "left" | "right",
  row: number,
) {
  const layout = environment[side];
  const feature = layout.doorRows.includes(row) ? "门口" : layout.windows.includes(row) ? "窗户" : "";
  const fixedFacilityLabels = facilities
    .filter((facility) => facility.placement.side === side.toUpperCase() && facility.placement.position === row)
    .map((facility) => facility.label);
  return [feature, ...fixedFacilityLabels].filter(Boolean).join(" · ");
}

function boundaryLabel(
  label: string,
  facilities: readonly SeatingExportFacility[],
  side: "FRONT" | "BACK",
) {
  const fixedFacilityLabels = facilities
    .filter((facility) => facility.placement.side === side)
    .map((facility) => `${facility.label}（第 ${facility.placement.position} 座）`);
  return fixedFacilityLabels.length ? `${label} · ${fixedFacilityLabels.join("、")}` : label;
}

export function buildSeatingMatrix(input: SeatingExportInput): string[][] {
  const { rows, columns, studentById, assignmentByPosition } = createIndexes(input);
  const isPodiumBottom = input.podiumPosition === "BOTTOM";
  const mirrorColumns = Boolean(input.mirrorColumns);

  if (input.environment) {
    const originalTracks = getSeatingExportTracks(input);
    const tracks = mirrorColumns ? [...originalTracks].reverse() : originalTracks;
    const facilities = getFixedFacilities(input.environment, rows, columns);
    const physicalColumnCount = tracks.length + 3;

    const rowList = isPodiumBottom
      ? Array.from({ length: rows }, (_, index) => rows - index)
      : Array.from({ length: rows }, (_, index) => index + 1);

    const leftSide = mirrorColumns ? "right" : "left";
    const rightSide = mirrorColumns ? "left" : "right";

    const podiumRow = ["", boundaryLabel("讲台", facilities, "FRONT"), ...emptyCells(physicalColumnCount - 2)];

    const headerRow = [
      "",
      "排\\座",
      ...tracks.map((track) => track.type === "SEAT" ? `第 ${track.seatColumn} 座` : "过道"),
      "",
    ];

    const bodyRows = rowList.map((row) => [
      sideMarker(input.environment!, facilities, leftSide, row),
      `第 ${row} 排`,
      ...tracks.map((track) => (
        track.type === "AISLE" || row > rows
          ? ""
          : seatValue(row, track.seatColumn, assignmentByPosition, studentById)
      )),
      sideMarker(input.environment!, facilities, rightSide, row),
    ]);

    const rawClass = input.className?.trim();
    const title = rawClass
      ? (rawClass.endsWith("班") ? `${rawClass}座次表` : `${rawClass}班座次表`)
      : "班级座次表";

    const matrix: string[][] = [
      [title, ...emptyCells(physicalColumnCount - 1)],
    ];

    const hasBackFacility = facilities.some((f) => f.placement.side === "BACK");
    const backRow = hasBackFacility
      ? ["", boundaryLabel("教室后墙", facilities, "BACK"), ...emptyCells(physicalColumnCount - 2)]
      : null;

    if (isPodiumBottom) {
      if (backRow) matrix.push(backRow);
      matrix.push(headerRow);
      matrix.push(...bodyRows);
      matrix.push(podiumRow);
    } else {
      matrix.push(podiumRow);
      matrix.push(headerRow);
      matrix.push(...bodyRows);
      if (backRow) matrix.push(backRow);
    }

    return matrix;
  }

  const rawClass = input.className?.trim();
  const title = rawClass
    ? (rawClass.endsWith("班") ? `${rawClass}座次表` : `${rawClass}班座次表`)
    : "班级座次表";

  const colList = mirrorColumns
    ? Array.from({ length: columns }, (_, index) => columns - index)
    : Array.from({ length: columns }, (_, index) => index + 1);

  const rowList = isPodiumBottom
    ? Array.from({ length: rows }, (_, index) => rows - index)
    : Array.from({ length: rows }, (_, index) => index + 1);

  const matrix: string[][] = [
    [title, ...Array.from({ length: columns }, () => "")],
    ["排\\座", ...colList.map((column) => `第 ${column} 座`)],
  ];

  for (const row of rowList) {
    const values = [`第 ${row} 排`];
    for (const column of colList) {
      values.push(seatValue(row, column, assignmentByPosition, studentById));
    }
    matrix.push(values);
  }

  return matrix;
}

export function buildSeatingRosterRows(input: SeatingExportInput): SeatingExportRosterRow[] {
  const { assignmentByStudent } = createIndexes(input);
  return [...input.students]
    .sort((left, right) => {
      const leftAssignment = assignmentByStudent.get(left.id);
      const rightAssignment = assignmentByStudent.get(right.id);
      if (leftAssignment && !rightAssignment) return -1;
      if (!leftAssignment && rightAssignment) return 1;
      if (leftAssignment && rightAssignment) {
        return leftAssignment.row - rightAssignment.row
          || leftAssignment.column - rightAssignment.column;
      }
      return left.studentNo.localeCompare(right.studentNo, "zh-CN");
    })
    .map((student) => {
      const assignment = assignmentByStudent.get(student.id);
      return {
        排: assignment?.row ?? "",
        座: assignment?.column ?? "",
        姓名: safeCellText(student.name),
        状态: assignment ? "已安排" : "未分配",
      };
    });
}

export function getSeatingExportFilename(now = new Date(), className?: string) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const rawClass = className?.trim();
  const baseName = rawClass
    ? (rawClass.endsWith("班") ? `${rawClass}座次表` : `${rawClass}班座次表`)
    : "班级座次表";
  return `${baseName}-${year}${month}${day}.xlsx`;
}
