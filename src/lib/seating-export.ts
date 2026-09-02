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
}

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

export function buildSeatingMatrix(input: SeatingExportInput): string[][] {
  const { rows, columns, studentById, assignmentByPosition } = createIndexes(input);
  const matrix: string[][] = [
    ["班级座次表", ...Array.from({ length: columns }, () => "")],
    [`面向讲台 · ${rows} 排 · ${columns} 个座位/排`, ...Array.from({ length: columns }, () => "")],
    ["排\\座", ...Array.from({ length: columns }, (_, index) => `第 ${index + 1} 座`)],
  ];

  for (let row = 1; row <= rows; row += 1) {
    const values = [`第 ${row} 排`];
    for (let column = 1; column <= columns; column += 1) {
      const assignment = assignmentByPosition.get(`${row}-${column}`);
      const student = assignment ? studentById.get(assignment.studentId) : undefined;
      values.push(student ? safeCellText(student.name) : assignment ? "未知学生" : "空座");
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
