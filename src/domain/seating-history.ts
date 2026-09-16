import type { SeatingEnvironment } from "./seating";
import type { StudentGenderValue } from "./student-gender";

export const MAX_SEATING_HISTORY_COUNT = 12;

export type SeatingTriggerType = "MANUAL" | "ROTATION" | "RESTORE";

export interface SeatingHistoryAssignment {
  studentId: string;
  studentName: string;
  studentNo: string;
  gender?: StudentGenderValue;
  row: number;
  column: number;
}

export interface SeatingHistorySummary {
  id: string;
  classId: string;
  operatorId: string | null;
  operatorName: string | null;
  triggerType: string;
  description: string | null;
  rows: number;
  columns: number;
  studentCount: number;
  createdAt: string;
}

export interface SeatingHistoryDetail extends SeatingHistorySummary {
  assignments: SeatingHistoryAssignment[];
  environment: SeatingEnvironment;
}

export interface StudentInfo {
  id: string;
  name: string;
  studentNo: string;
  gender?: StudentGenderValue;
}

/**
 * Builds a frozen snapshot of seat assignments enriched with student basic information.
 */
export function buildHistoryAssignmentsSnapshot(
  assignments: readonly { studentId: string; row: number; column: number }[],
  students: readonly StudentInfo[],
): SeatingHistoryAssignment[] {
  const studentMap = new Map<string, StudentInfo>();
  for (const student of students) {
    studentMap.set(student.id, student);
  }

  return assignments
    .map((assignment) => {
      const student = studentMap.get(assignment.studentId);
      return {
        studentId: assignment.studentId,
        studentName: student?.name ?? "",
        studentNo: student?.studentNo ?? "",
        gender: student?.gender,
        row: assignment.row,
        column: assignment.column,
      };
    })
    .sort((a, b) => a.row - b.row || a.column - b.column);
}

/**
 * Checks whether two seating configurations are identical to prevent duplicate consecutive history entries.
 */
export function areSeatingSnapshotsEquivalent(
  left: {
    rows: number;
    columns: number;
    assignments: readonly { studentId: string; row: number; column: number }[];
    environment?: unknown;
  },
  right: {
    rows: number;
    columns: number;
    assignments: readonly { studentId: string; row: number; column: number }[];
    environment?: unknown;
  },
): boolean {
  if (left.rows !== right.rows || left.columns !== right.columns) {
    return false;
  }
  if (left.assignments.length !== right.assignments.length) {
    return false;
  }

  const leftSorted = [...left.assignments].sort(
    (a, b) => a.row - b.row || a.column - b.column,
  );
  const rightSorted = [...right.assignments].sort(
    (a, b) => a.row - b.row || a.column - b.column,
  );

  for (let i = 0; i < leftSorted.length; i++) {
    const l = leftSorted[i];
    const r = rightSorted[i];
    if (l.studentId !== r.studentId || l.row !== r.row || l.column !== r.column) {
      return false;
    }
  }

  // Compare environment JSON representations
  const leftEnv = left.environment ? JSON.stringify(left.environment) : null;
  const rightEnv = right.environment ? JSON.stringify(right.environment) : null;
  return leftEnv === rightEnv;
}

export interface RestorableAssignmentsResult {
  validAssignments: { studentId: string; row: number; column: number }[];
  skippedAssignments: SeatingHistoryAssignment[];
  unassignedActiveStudents: StudentInfo[];
}

/**
 * Filters historical assignments against currently active students in the classroom.
 * If a student from the history snapshot is no longer active in the class, that seat will remain empty.
 */
export function filterRestorableAssignments(
  historyAssignments: readonly SeatingHistoryAssignment[],
  activeStudents: readonly StudentInfo[],
  maxRows: number,
  maxColumns: number,
): RestorableAssignmentsResult {
  const activeStudentMap = new Map<string, StudentInfo>();
  for (const student of activeStudents) {
    activeStudentMap.set(student.id, student);
  }

  const validAssignments: { studentId: string; row: number; column: number }[] = [];
  const skippedAssignments: SeatingHistoryAssignment[] = [];
  const assignedStudentIds = new Set<string>();

  for (const item of historyAssignments) {
    // Check boundaries
    if (item.row < 1 || item.row > maxRows || item.column < 1 || item.column > maxColumns) {
      skippedAssignments.push(item);
      continue;
    }

    if (activeStudentMap.has(item.studentId)) {
      validAssignments.push({
        studentId: item.studentId,
        row: item.row,
        column: item.column,
      });
      assignedStudentIds.add(item.studentId);
    } else {
      skippedAssignments.push(item);
    }
  }

  const unassignedActiveStudents = activeStudents.filter(
    (student) => !assignedStudentIds.has(student.id),
  );

  return {
    validAssignments,
    skippedAssignments,
    unassignedActiveStudents,
  };
}

export type SeatDiffStatus = "SAME" | "MOVED" | "NEW" | "REMOVED" | "EMPTY";

export interface SeatDiffEntry {
  row: number;
  column: number;
  status: SeatDiffStatus;
  currentStudentId?: string;
  historyStudentId?: string;
}

/**
 * Calculates differences between the current layout and a historical snapshot for visual diff display.
 */
export function calculateSeatingDiff(
  currentAssignments: readonly { studentId: string; row: number; column: number }[],
  historyAssignments: readonly { studentId: string; row: number; column: number }[],
  rows: number,
  columns: number,
): Map<string, SeatDiffStatus> {
  const currentMap = new Map<string, string>(); // "row:col" -> studentId
  const historyMap = new Map<string, string>(); // "row:col" -> studentId

  for (const item of currentAssignments) {
    currentMap.set(`${item.row}:${item.column}`, item.studentId);
  }
  for (const item of historyAssignments) {
    historyMap.set(`${item.row}:${item.column}`, item.studentId);
  }

  const diffMap = new Map<string, SeatDiffStatus>();

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= columns; c++) {
      const key = `${r}:${c}`;
      const cur = currentMap.get(key);
      const his = historyMap.get(key);

      if (!cur && !his) {
        diffMap.set(key, "EMPTY");
      } else if (cur === his) {
        diffMap.set(key, "SAME");
      } else if (cur && his) {
        diffMap.set(key, "MOVED");
      } else if (cur && !his) {
        diffMap.set(key, "REMOVED"); // Empty in history, occupied in current
      } else if (!cur && his) {
        diffMap.set(key, "NEW"); // Occupied in history, empty in current
      }
    }
  }

  return diffMap;
}
