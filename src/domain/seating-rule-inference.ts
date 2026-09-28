import type { SeatAssignment } from "./seating";
import {
  PRESET_ROTATION_SCHEMES,
  rotateSeatAssignments,
  type SeatingRotationScheme,
} from "./seating-rotation";

export interface SeatingRuleSnapshot {
  rows: number;
  columns: number;
  assignments: readonly SeatAssignment[];
}

export interface SeatingRuleCandidate {
  ruleId: string;
  name: string;
  description: string;
  scheme: SeatingRotationScheme;
  confidence: number;
  sampleCount: number;
  matchedTransitions: number;
  comparableTransitions: number;
  exceptions: string[];
  conflicts: string[];
}

export interface SeatingRuleInferenceOptions {
  schemes?: readonly SeatingRotationScheme[];
  lockedSeatKeys?: ReadonlySet<string>;
  disabledSeatKeys?: ReadonlySet<string>;
}

function samePosition(left?: SeatAssignment, right?: SeatAssignment): boolean {
  return Boolean(
    left
    && right
    && left.row === right.row
    && left.column === right.column,
  );
}

function getStudentMap(assignments: readonly SeatAssignment[]): Map<string, SeatAssignment> {
  return new Map(assignments.map((assignment) => [assignment.studentId, assignment]));
}

/** Compares historical snapshots against the explainable rotation schemes already supported by the app. */
export function inferSeatingRuleCandidates(
  snapshots: readonly SeatingRuleSnapshot[],
  options: SeatingRuleInferenceOptions = {},
): SeatingRuleCandidate[] {
  const schemes = options.schemes ?? PRESET_ROTATION_SCHEMES;
  return schemes
    .map((scheme) => {
      let matchedTransitions = 0;
      let comparableTransitions = 0;
      const exceptions = new Set<string>();
      const conflicts = new Set<string>();

      for (let index = 0; index < snapshots.length - 1; index += 1) {
        const previous = snapshots[index];
        const current = snapshots[index + 1];
        if (previous.rows !== current.rows || previous.columns !== current.columns) {
          conflicts.add(`第 ${index + 1} 与第 ${index + 2} 张快照的布局尺寸不同`);
          continue;
        }

        const previousByStudent = getStudentMap(previous.assignments);
        const currentByStudent = getStudentMap(current.assignments);
        const sharedStudentIds = [...previousByStudent.keys()].filter((studentId) => currentByStudent.has(studentId));
        if (sharedStudentIds.length === 0) continue;

        const transformed = rotateSeatAssignments(
          previous.assignments,
          previous.rows,
          previous.columns,
          scheme,
          options.lockedSeatKeys,
          options.disabledSeatKeys,
        );
        const transformedByStudent = getStudentMap(transformed.newAssignments);

        for (const studentId of sharedStudentIds) {
          comparableTransitions += 1;
          if (samePosition(transformedByStudent.get(studentId), currentByStudent.get(studentId))) {
            matchedTransitions += 1;
          } else {
            exceptions.add(studentId);
          }
        }
      }

      return {
        ruleId: scheme.id,
        name: scheme.name,
        description: scheme.description,
        scheme: { ...scheme },
        confidence: comparableTransitions > 0 ? matchedTransitions / comparableTransitions : 0,
        sampleCount: snapshots.length,
        matchedTransitions,
        comparableTransitions,
        exceptions: [...exceptions],
        conflicts: [...conflicts],
      } satisfies SeatingRuleCandidate;
    })
    .sort((left, right) => (
      right.confidence - left.confidence
      || right.matchedTransitions - left.matchedTransitions
      || left.ruleId.localeCompare(right.ruleId)
    ));
}
