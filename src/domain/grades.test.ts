import { describe, expect, it } from "vitest";

import {
  calculateSubjectStatistics,
  rankExamResults,
  roundTo,
} from "./grades";

describe("calculateSubjectStatistics", () => {
  it("calculates average, extrema and pass rate", () => {
    const statistics = calculateSubjectStatistics({
      maxScore: 100,
      passScore: 60,
      scores: [
        { score: 96, absent: false },
        { score: 60, absent: false },
        { score: 59.5, absent: false },
      ],
    });

    expect(statistics).toEqual({
      participantCount: 3,
      absentCount: 0,
      average: 71.83,
      highest: 96,
      lowest: 59.5,
      passRate: 66.67,
    });
  });

  it("excludes absent records from every score statistic", () => {
    const statistics = calculateSubjectStatistics({
      maxScore: 100,
      passScore: 60,
      scores: [
        { score: null, absent: true },
        { score: 80, absent: false },
      ],
    });

    expect(statistics.participantCount).toBe(1);
    expect(statistics.absentCount).toBe(1);
    expect(statistics.average).toBe(80);
    expect(statistics.passRate).toBe(100);
  });

  it("returns null statistics when nobody participated", () => {
    const statistics = calculateSubjectStatistics({
      maxScore: 100,
      passScore: 60,
      scores: [{ score: null, absent: true }],
    });

    expect(statistics).toEqual({
      participantCount: 0,
      absentCount: 1,
      average: null,
      highest: null,
      lowest: null,
      passRate: null,
    });
  });

  it("rejects scores beyond the subject maximum", () => {
    expect(() =>
      calculateSubjectStatistics({
        maxScore: 100,
        passScore: 60,
        scores: [{ score: 100.5, absent: false }],
      }),
    ).toThrow("成绩必须在 0 和满分之间");
  });
});

describe("rankExamResults", () => {
  it("uses competition ranking for tied totals", () => {
    const results = rankExamResults([
      {
        studentId: "a",
        studentName: "陈晨",
        subjectScores: [
          { subjectId: "chinese", score: 90, absent: false },
          { subjectId: "math", score: 95, absent: false },
        ],
      },
      {
        studentId: "b",
        studentName: "林溪",
        subjectScores: [
          { subjectId: "chinese", score: 95, absent: false },
          { subjectId: "math", score: 90, absent: false },
        ],
      },
      {
        studentId: "c",
        studentName: "周屿",
        subjectScores: [
          { subjectId: "chinese", score: 80, absent: false },
          { subjectId: "math", score: null, absent: true },
        ],
      },
    ]);

    expect(results.map(({ studentId, total, rank }) => ({ studentId, total, rank }))).toEqual([
      { studentId: "a", total: 185, rank: 1 },
      { studentId: "b", total: 185, rank: 1 },
      { studentId: "c", total: 80, rank: 3 },
    ]);
    expect(results[2].absentSubjectCount).toBe(1);
  });
});

describe("roundTo", () => {
  it("rounds decimal values without exposing floating point noise", () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
  });
});
