import { describe, expect, it } from "vitest";

import {
  inferSeatingRuleCandidates,
  type SeatingRuleSnapshot,
} from "./seating-rule-inference";
import { DEFAULT_ROTATION_SCHEME, rotateSeatAssignments } from "./seating-rotation";

const firstSnapshot: SeatingRuleSnapshot = {
  rows: 3,
  columns: 4,
  assignments: [
    { studentId: "s-1", row: 1, column: 1 },
    { studentId: "s-2", row: 1, column: 2 },
    { studentId: "s-3", row: 1, column: 3 },
    { studentId: "s-4", row: 3, column: 4 },
  ],
};

const secondSnapshot: SeatingRuleSnapshot = {
  ...firstSnapshot,
  assignments: rotateSeatAssignments(
    firstSnapshot.assignments,
    firstSnapshot.rows,
    firstSnapshot.columns,
    DEFAULT_ROTATION_SCHEME,
  ).newAssignments,
};

describe("domain/seating-rule-inference", () => {
  it("ranks the matching preset rule first and exposes evidence", () => {
    const candidates = inferSeatingRuleCandidates([firstSnapshot, secondSnapshot]);

    expect(candidates[0]).toMatchObject({
      ruleId: DEFAULT_ROTATION_SCHEME.id,
      confidence: 1,
      sampleCount: 2,
      matchedTransitions: 4,
      comparableTransitions: 4,
      exceptions: [],
    });
  });

  it("requires comparable snapshots and reports changed students", () => {
    const changedSnapshot: SeatingRuleSnapshot = {
      ...secondSnapshot,
      assignments: secondSnapshot.assignments.map((assignment) => (
        assignment.studentId === "s-1" ? { ...assignment, row: 1, column: 4 } : assignment
      )),
    };

    const candidates = inferSeatingRuleCandidates([firstSnapshot, changedSnapshot]);
    const defaultCandidate = candidates.find((candidate) => candidate.ruleId === DEFAULT_ROTATION_SCHEME.id);

    expect(defaultCandidate).toMatchObject({
      confidence: 0.75,
      matchedTransitions: 3,
      comparableTransitions: 4,
      exceptions: ["s-1"],
    });
  });

  it("does not infer a transition when snapshots have no shared students", () => {
    const candidates = inferSeatingRuleCandidates([
      firstSnapshot,
      {
        ...secondSnapshot,
        assignments: secondSnapshot.assignments.map((assignment) => ({
          ...assignment,
          studentId: `${assignment.studentId}-new`,
        })),
      },
    ]);

    expect(candidates[0]).toMatchObject({
      confidence: 0,
      matchedTransitions: 0,
      comparableTransitions: 0,
      exceptions: [],
    });
  });
});
