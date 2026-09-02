import {
  DEFAULT_SEATING_SIDE_MARKER_ROWS,
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
  rows: number;
  columns: number;
  students: readonly SeatingExportStudent[];
  assignments: readonly SeatingExportAssignment[];
  environment?: SeatingEnvironment;
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
  return student ? safeCellText(student.name) : assignment ? "未知学生" : "空座";
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

  if (input.environment) {
    const tracks = getSeatingExportTracks(input);
    const facilities = getFixedFacilities(input.environment, rows, columns);
    const visualRowCount = Math.max(rows, DEFAULT_SEATING_SIDE_MARKER_ROWS);
    const physicalColumnCount = tracks.length + 3;
    const matrix: string[][] = [
      ["班级座次表", ...emptyCells(physicalColumnCount - 1)],
      [`面向讲台 · ${rows} 排 · ${columns} 个座位/排`, ...emptyCells(physicalColumnCount - 1)],
      ["前方", boundaryLabel("讲台", facilities, "FRONT"), ...emptyCells(physicalColumnCount - 2)],
      [
        "左侧",
        "排\\座",
        ...tracks.map((track) => track.type === "SEAT" ? `第 ${track.seatColumn} 座` : "过道"),
        "右侧",
      ],
    ];

    for (let row = 1; row <= visualRowCount; row += 1) {
      matrix.push([
        sideMarker(input.environment, facilities, "left", row),
        `第 ${row} 排`,
        ...tracks.map((track) => (
          track.type === "AISLE" || row > rows
            ? ""
            : seatValue(row, track.seatColumn, assignmentByPosition, studentById)
        )),
        sideMarker(input.environment, facilities, "right", row),
      ]);
    }

    matrix.push(["后方", boundaryLabel("教室后墙", facilities, "BACK"), ...emptyCells(physicalColumnCount - 2)]);
    return matrix;
  }

  const matrix: string[][] = [
    ["班级座次表", ...Array.from({ length: columns }, () => "")],
    [`面向讲台 · ${rows} 排 · ${columns} 个座位/排`, ...Array.from({ length: columns }, () => "")],
    ["排\\座", ...Array.from({ length: columns }, (_, index) => `第 ${index + 1} 座`)],
  ];

  for (let row = 1; row <= rows; row += 1) {
    const values = [`第 ${row} 排`];
    for (let column = 1; column <= columns; column += 1) {
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

export function getSeatingExportFilename(now = new Date()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `班级座次表-${year}${month}${day}.xlsx`;
}
