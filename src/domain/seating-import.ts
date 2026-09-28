import {
  createDefaultSeatingEnvironment,
  type SeatingEnvironment,
} from "./seating";

export type SeatingImportSourceType = "CSV" | "XLSX" | "IMAGE";
export type SeatingImportOrientation = "FRONT_TOP" | "FRONT_BOTTOM" | "UNKNOWN";

export interface SeatingImportStudent {
  id: string;
  name: string;
  studentNo: string;
}

export type SeatingImportIssueCode =
  | "UNSUPPORTED_FORMAT"
  | "INVALID_POSITION"
  | "INVALID_DIMENSIONS"
  | "DISABLED_SEAT"
  | "UNMATCHED_STUDENT"
  | "DUPLICATE_STUDENT"
  | "DUPLICATE_POSITION"
  | "OCR_LAYOUT_UNCERTAIN"
  | "LOW_OCR_CONFIDENCE";

export interface SeatingImportIssue {
  code: SeatingImportIssueCode;
  message: string;
  row?: number;
  column?: number;
  sourceText?: string;
}

export interface SeatingImportMatch {
  sourceText: string;
  row: number;
  column: number;
  studentId: string | null;
  status: "EXACT" | "UNMATCHED" | "DUPLICATE" | "CORRECTED" | "EMPTY";
  matchedBy?: "STUDENT_NO" | "NAME" | "MANUAL";
}

export interface SeatingImportDraft {
  rows: number;
  columns: number;
  assignments: Array<{ studentId: string; row: number; column: number }>;
  environment: SeatingEnvironment;
  orientation: SeatingImportOrientation;
  issues: SeatingImportIssue[];
}

export interface SeatingImportStats {
  matched: number;
  unmatched: number;
  duplicate: number;
  empty: number;
  totalCells: number;
}

export interface SeatingImportPreview {
  draft: SeatingImportDraft;
  matches: SeatingImportMatch[];
  issues: SeatingImportIssue[];
  stats: SeatingImportStats;
}

export interface SeatingMatrixOptions {
  existingEnvironment?: SeatingEnvironment;
  sourceType?: SeatingImportSourceType;
}

const EMPTY_CELL_VALUES = new Set(["", "-", "—", "空", "空座", "未安排", "未分配"]);

function normalizeCell(value: unknown): string {
  return String(value ?? "")
    .replace(/^'/, "")
    .trim();
}

function normalizeName(value: string): string {
  return normalizeCell(value)
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\u3000()（）[\]【】·•]/g, "");
}

function normalizeStudentNo(value: string): string {
  const normalized = normalizeCell(value);
  if (/^\d+(?:\.0+)?$/.test(normalized)) {
    return normalized.replace(/\.0+$/, "").replace(/^0+(?=\d)/, "");
  }
  return normalized.toLocaleLowerCase("zh-CN");
}

function cloneEnvironment(environment: SeatingEnvironment, columns: number): SeatingEnvironment {
  return {
    aisleAfterColumns: environment.aisleAfterColumns.filter((column) => column >= 1 && column < columns),
    left: {
      windows: [...environment.left.windows],
      doorRows: [...environment.left.doorRows],
    },
    right: {
      windows: [...environment.right.windows],
      doorRows: [...environment.right.doorRows],
    },
    rear: { ...environment.rear },
    ...(environment.fixedFacilities ? { fixedFacilities: { ...environment.fixedFacilities } } : {}),
    ...(environment.disabledSeats ? { disabledSeats: environment.disabledSeats.map((seat) => ({ ...seat })) } : {}),
    ...(environment.lockedSeats ? { lockedSeats: environment.lockedSeats.map((seat) => ({ ...seat })) } : {}),
  };
}

function createEnvironment(
  columns: number,
  options: SeatingMatrixOptions,
  detectedAisles: number[],
): SeatingEnvironment {
  if (options.existingEnvironment) {
    const environment = cloneEnvironment(options.existingEnvironment, columns);
    return detectedAisles.length > 0
      ? { ...environment, aisleAfterColumns: detectedAisles }
      : environment;
  }

  return {
    ...createDefaultSeatingEnvironment(columns),
    aisleAfterColumns: detectedAisles,
  };
}

function findIndex(row: readonly string[], matcher: (value: string) => boolean): number {
  return row.findIndex((value) => matcher(normalizeCell(value)));
}

function parseNumber(value: string): number | null {
  const match = normalizeCell(value).match(/^(?:第\s*)?(\d+)\s*(?:排|座)?$/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isEmptyCell(value: string): boolean {
  return EMPTY_CELL_VALUES.has(normalizeCell(value));
}

function createResult(
  rows: number,
  columns: number,
  assignments: SeatingImportDraft["assignments"],
  environment: SeatingEnvironment,
  orientation: SeatingImportOrientation,
  matches: SeatingImportMatch[],
  issues: SeatingImportIssue[],
  stats: SeatingImportStats,
): SeatingImportPreview {
  const layoutIssues = getLayoutIssues(rows, columns, assignments, environment);
  const allIssues = [...issues, ...layoutIssues];
  return {
    draft: { rows, columns, assignments, environment, orientation, issues: allIssues },
    matches,
    issues: allIssues,
    stats,
  };
}

function getLayoutIssues(
  rows: number,
  columns: number,
  assignments: SeatingImportDraft["assignments"],
  environment: SeatingEnvironment,
): SeatingImportIssue[] {
  const issues: SeatingImportIssue[] = [];
  if (rows > 12 || columns > 12) {
    issues.push({ code: "INVALID_DIMENSIONS", message: "座位图最多支持 12 排 × 12 列" });
  }
  const disabled = new Set((environment.disabledSeats ?? []).map((seat) => `${seat.row}:${seat.column}`));
  for (const assignment of assignments) {
    if (disabled.has(`${assignment.row}:${assignment.column}`)) {
      issues.push({
        code: "DISABLED_SEAT",
        message: `第 ${assignment.row} 排第 ${assignment.column} 座已停用，请留空或修改教室布局`,
        row: assignment.row,
        column: assignment.column,
      });
    }
  }
  return issues;
}

function matchStudent(
  sourceText: string,
  students: readonly SeatingImportStudent[],
): { student: SeatingImportStudent; matchedBy: "STUDENT_NO" | "NAME" } | null {
  const studentNo = normalizeStudentNo(sourceText);
  const byStudentNo = students.find((student) => normalizeStudentNo(student.studentNo) === studentNo);
  if (byStudentNo) return { student: byStudentNo, matchedBy: "STUDENT_NO" };

  const name = normalizeName(sourceText);
  const byName = students.find((student) => normalizeName(student.name) === name);
  return byName ? { student: byName, matchedBy: "NAME" } : null;
}

function addAssignmentCell(
  sourceText: string,
  row: number,
  column: number,
  students: readonly SeatingImportStudent[],
  assignments: SeatingImportDraft["assignments"],
  matches: SeatingImportMatch[],
  issues: SeatingImportIssue[],
  stats: SeatingImportStats,
) {
  const text = normalizeCell(sourceText);
  stats.totalCells += 1;
  if (isEmptyCell(text)) {
    stats.empty += 1;
    return;
  }

  const matched = matchStudent(text, students);
  if (!matched) {
    stats.unmatched += 1;
    matches.push({ sourceText: text, row, column, studentId: null, status: "UNMATCHED" });
    issues.push({
      code: "UNMATCHED_STUDENT",
      message: `第 ${row} 排第 ${column} 座无法匹配学生“${text}”`,
      row,
      column,
      sourceText: text,
    });
    return;
  }

  const duplicateStudent = assignments.some((assignment) => assignment.studentId === matched.student.id);
  const duplicatePosition = assignments.some(
    (assignment) => assignment.row === row && assignment.column === column,
  );
  if (duplicateStudent || duplicatePosition) {
    stats.duplicate += 1;
    matches.push({
      sourceText: text,
      row,
      column,
      studentId: matched.student.id,
      status: "DUPLICATE",
      matchedBy: matched.matchedBy,
    });
    issues.push({
      code: duplicateStudent ? "DUPLICATE_STUDENT" : "DUPLICATE_POSITION",
      message: duplicateStudent
        ? `学生“${matched.student.name}”在导入文件中出现多次`
        : `第 ${row} 排第 ${column} 座出现多次`,
      row,
      column,
      sourceText: text,
    });
    return;
  }

  stats.matched += 1;
  assignments.push({ studentId: matched.student.id, row, column });
  matches.push({
    sourceText: text,
    row,
    column,
    studentId: matched.student.id,
    status: "EXACT",
    matchedBy: matched.matchedBy,
  });
}

function parseDetailRows(
  matrix: readonly string[][],
  students: readonly SeatingImportStudent[],
  options: SeatingMatrixOptions,
): SeatingImportPreview | null {
  const headerIndex = matrix.findIndex((row) => {
    const normalized = row.map(normalizeCell);
    return normalized.some((value) => value === "排" || value === "行")
      && normalized.some((value) => value === "座" || value === "列")
      && normalized.some((value) => value === "姓名" || value === "学号");
  });
  if (headerIndex < 0) return null;

  const header = matrix[headerIndex].map(normalizeCell);
  const rowIndex = findIndex(header, (value) => value === "排" || value === "行");
  const columnIndex = findIndex(header, (value) => value === "座" || value === "列");
  const valueIndex = findIndex(header, (value) => value === "姓名" || value === "学号");
  const assignments: SeatingImportDraft["assignments"] = [];
  const matches: SeatingImportMatch[] = [];
  const issues: SeatingImportIssue[] = [];
  const stats: SeatingImportStats = { matched: 0, unmatched: 0, duplicate: 0, empty: 0, totalCells: 0 };
  let maxRow = 0;
  let maxColumn = 0;

  for (const sourceRow of matrix.slice(headerIndex + 1)) {
    const row = parseNumber(sourceRow[rowIndex] ?? "");
    const column = parseNumber(sourceRow[columnIndex] ?? "");
    if (row === null || column === null) {
      const sourceText = normalizeCell(sourceRow[valueIndex] ?? "");
      if (!isEmptyCell(sourceText)) {
        issues.push({
          code: "INVALID_POSITION",
          message: `学生“${sourceText}”缺少有效的排号或座号`,
          sourceText,
        });
      }
      continue;
    }
    maxRow = Math.max(maxRow, row);
    maxColumn = Math.max(maxColumn, column);
    addAssignmentCell(
      sourceRow[valueIndex] ?? "",
      row,
      column,
      students,
      assignments,
      matches,
      issues,
      stats,
    );
  }

  const columns = Math.max(1, maxColumn);
  return createResult(
    Math.max(1, maxRow),
    columns,
    assignments.sort((left, right) => left.row - right.row || left.column - right.column),
    createEnvironment(columns, options, []),
    "UNKNOWN",
    matches,
    issues,
    stats,
  );
}

function parseMatrixRows(
  matrix: readonly string[][],
  students: readonly SeatingImportStudent[],
  options: SeatingMatrixOptions,
): SeatingImportPreview {
  const normalizedMatrix = matrix.map((row) => row.map(normalizeCell));
  const headerIndex = normalizedMatrix.findIndex((row) => row.some((value) => value === "排\\座" || value === "排/座"));
  const header = headerIndex >= 0 ? normalizedMatrix[headerIndex] : [];
  const seatHeaders = header
    .map((value, index) => ({ value, index, column: parseNumber(value) }))
    .filter((item): item is { value: string; index: number; column: number } => (
      item.column !== null && /^第\s*\d+\s*座$/.test(item.value)
    ));

  const issues: SeatingImportIssue[] = [];
  if (headerIndex < 0 || seatHeaders.length === 0) {
    issues.push({ code: "UNSUPPORTED_FORMAT", message: "未识别到座位表表头，请使用“排\\座”或明细格式" });
    const columns = Math.max(1, options.existingEnvironment?.aisleAfterColumns.length ? 1 : 1);
    return createResult(
      1,
      columns,
      [],
      createEnvironment(columns, options, []),
      "UNKNOWN",
      [],
      issues,
      { matched: 0, unmatched: 0, duplicate: 0, empty: 0, totalCells: 0 },
    );
  }

  const columnNumbers = seatHeaders.map((seat) => seat.column);
  if (new Set(columnNumbers).size !== columnNumbers.length || Math.max(...columnNumbers) !== columnNumbers.length) {
    issues.push({ code: "INVALID_POSITION", message: "座位表列标题存在重复或缺少连续座号" });
  }

  const aisleAfterColumns = header
    .map((value, index) => ({ value, index }))
    .filter((item) => item.value === "过道")
    .map((item) => {
      const before = seatHeaders.filter((seat) => seat.index < item.index).at(-1);
      const after = seatHeaders.find((seat) => seat.index > item.index);
      return before && after && Math.abs(before.column - after.column) === 1
        ? Math.min(before.column, after.column)
        : null;
    })
    .filter((column): column is number => column !== null);
  const assignments: SeatingImportDraft["assignments"] = [];
  const matches: SeatingImportMatch[] = [];
  const rowIssues: SeatingImportIssue[] = [];
  const stats: SeatingImportStats = { matched: 0, unmatched: 0, duplicate: 0, empty: 0, totalCells: 0 };
  let maxRow = 0;
  let hasPodiumBeforeHeader = false;
  let hasPodiumAfterHeader = false;

  normalizedMatrix.forEach((row, index) => {
    if (row.some((value) => value.includes("讲台"))) {
      if (index < headerIndex) hasPodiumBeforeHeader = true;
      if (index > headerIndex) hasPodiumAfterHeader = true;
    }
  });

  for (const sourceRow of normalizedMatrix.slice(headerIndex + 1)) {
    const rowLabel = sourceRow.find((value) => /^第\s*\d+\s*排$/.test(value));
    const row = rowLabel ? parseNumber(rowLabel) : null;
    if (row === null) continue;
    maxRow = Math.max(maxRow, row);
    for (const seatHeader of seatHeaders) {
      addAssignmentCell(
        sourceRow[seatHeader.index] ?? "",
        row,
        seatHeader.column,
        students,
        assignments,
        matches,
        rowIssues,
        stats,
      );
    }
  }

  const columns = Math.max(1, ...seatHeaders.map((seat) => seat.column));
  const orientation: SeatingImportOrientation = hasPodiumBeforeHeader
    ? "FRONT_TOP"
    : hasPodiumAfterHeader
      ? "FRONT_BOTTOM"
      : "UNKNOWN";
  const allIssues = [...issues, ...rowIssues];
  return createResult(
    Math.max(1, maxRow),
    columns,
    assignments.sort((left, right) => left.row - right.row || left.column - right.column),
    createEnvironment(columns, options, [...new Set(aisleAfterColumns)].sort((left, right) => left - right)),
    orientation,
    matches,
    allIssues,
    stats,
  );
}

/** Parses CSV/TSV text while preserving quoted delimiters and escaped quotes. */
export function parseDelimitedText(text: string, delimiter?: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const separator = delimiter ?? (firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const next = text[index + 1];
    if (character === '"') {
      if (quoted && next === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === separator && !quoted) {
      row.push(field.trim());
      field = "";
    } else if (character === "\n" && !quoted) {
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseSeatingMatrix(
  matrix: readonly string[][],
  students: readonly SeatingImportStudent[],
  options: SeatingMatrixOptions = {},
): SeatingImportPreview {
  return parseDetailRows(matrix, students, options) ?? parseMatrixRows(matrix, students, options);
}

/** Rechecks every student and seat after a teacher resolves uncertain OCR matches. */
export function reviseSeatingImportPreview(
  preview: SeatingImportPreview,
  corrections: ReadonlyMap<number, string | null>,
): SeatingImportPreview {
  const preservedIssues = preview.issues.filter((issue) => ![
    "UNMATCHED_STUDENT",
    "DUPLICATE_STUDENT",
    "DUPLICATE_POSITION",
    "INVALID_DIMENSIONS",
    "DISABLED_SEAT",
  ].includes(issue.code) && !(
    issue.code === "LOW_OCR_CONFIDENCE"
    && preview.matches.some((match, index) => corrections.has(index)
      && match.row === issue.row && match.column === issue.column)
  ));
  const issues = [...preservedIssues];
  const assignments: SeatingImportDraft["assignments"] = [];
  const seenStudents = new Set<string>();
  const seenPositions = new Set<string>();
  const stats: SeatingImportStats = {
    matched: 0,
    unmatched: 0,
    duplicate: 0,
    empty: preview.stats.empty,
    totalCells: preview.stats.totalCells,
  };
  const matches = preview.matches.map((match, index): SeatingImportMatch => {
    const corrected = corrections.has(index);
    const studentId = corrected ? corrections.get(index) ?? null : match.studentId;
    if (!studentId) {
      if (corrected) {
        stats.empty += 1;
        return { ...match, studentId: null, status: "EMPTY", matchedBy: "MANUAL" };
      }
      stats.unmatched += 1;
      issues.push({
        code: "UNMATCHED_STUDENT",
        message: `第 ${match.row} 排第 ${match.column} 座无法匹配学生“${match.sourceText}”`,
        row: match.row,
        column: match.column,
        sourceText: match.sourceText,
      });
      return { ...match, status: "UNMATCHED" };
    }

    const positionKey = `${match.row}:${match.column}`;
    const duplicateStudent = seenStudents.has(studentId);
    const duplicatePosition = seenPositions.has(positionKey);
    if (duplicateStudent || duplicatePosition) {
      stats.duplicate += 1;
      issues.push({
        code: duplicateStudent ? "DUPLICATE_STUDENT" : "DUPLICATE_POSITION",
        message: duplicateStudent
          ? `同一学生在导入文件中出现多次`
          : `第 ${match.row} 排第 ${match.column} 座出现多次`,
        row: match.row,
        column: match.column,
        sourceText: match.sourceText,
      });
      return { ...match, studentId, status: "DUPLICATE" };
    }
    seenStudents.add(studentId);
    seenPositions.add(positionKey);
    stats.matched += 1;
    assignments.push({ studentId, row: match.row, column: match.column });
    return {
      ...match,
      studentId,
      status: corrected ? "CORRECTED" : "EXACT",
      matchedBy: corrected ? "MANUAL" : match.matchedBy,
    };
  });

  assignments.sort((left, right) => left.row - right.row || left.column - right.column);
  issues.push(...getLayoutIssues(preview.draft.rows, preview.draft.columns, assignments, preview.draft.environment));
  return {
    ...preview,
    matches,
    issues,
    stats,
    draft: { ...preview.draft, assignments, issues },
  };
}
