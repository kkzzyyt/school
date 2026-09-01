export interface ScoreValue {
  score: number | null;
  absent: boolean;
}

export interface SubjectStatisticsInput {
  maxScore: number;
  passScore: number;
  scores: ScoreValue[];
}

export interface SubjectStatistics {
  participantCount: number;
  absentCount: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  passRate: number | null;
}

export interface StudentSubjectScore extends ScoreValue {
  subjectId: string;
}

export interface StudentExamResultInput {
  studentId: string;
  studentName: string;
  subjectScores: StudentSubjectScore[];
}

export interface RankedExamResult extends StudentExamResultInput {
  total: number;
  rank: number;
  absentSubjectCount: number;
}

export function roundTo(value: number, decimalPlaces: number): number {
  const multiplier = 10 ** decimalPlaces;
  return Math.round((value + Number.EPSILON) * multiplier) / multiplier;
}

export function calculateSubjectStatistics(
  input: SubjectStatisticsInput,
): SubjectStatistics {
  if (input.maxScore <= 0 || input.passScore < 0 || input.passScore > input.maxScore) {
    throw new Error("考试分值设置不正确");
  }

  const participantScores = input.scores.flatMap((record) => {
    if (record.absent) {
      return [];
    }

    if (
      record.score === null ||
      record.score < 0 ||
      record.score > input.maxScore
    ) {
      throw new Error("成绩必须在 0 和满分之间");
    }

    return [record.score];
  });
  const absentCount = input.scores.filter((record) => record.absent).length;

  if (participantScores.length === 0) {
    return {
      participantCount: 0,
      absentCount,
      average: null,
      highest: null,
      lowest: null,
      passRate: null,
    };
  }

  const scoreTotal = participantScores.reduce((total, score) => total + score, 0);
  const passedCount = participantScores.filter(
    (score) => score >= input.passScore,
  ).length;

  return {
    participantCount: participantScores.length,
    absentCount,
    average: roundTo(scoreTotal / participantScores.length, 2),
    highest: Math.max(...participantScores),
    lowest: Math.min(...participantScores),
    passRate: roundTo((passedCount / participantScores.length) * 100, 2),
  };
}

export function rankExamResults(
  results: StudentExamResultInput[],
): RankedExamResult[] {
  const totals = results.map((result) => ({
    ...result,
    total: roundTo(
      result.subjectScores.reduce(
        (sum, subject) => sum + (subject.absent ? 0 : (subject.score ?? 0)),
        0,
      ),
      2,
    ),
    absentSubjectCount: result.subjectScores.filter((subject) => subject.absent)
      .length,
  }));

  const sorted = [...totals].sort(
    (left, right) =>
      right.total - left.total || left.studentName.localeCompare(right.studentName, "zh-CN"),
  );

  return sorted.map((result, index) => ({
    ...result,
    rank:
      index > 0 && result.total === sorted[index - 1].total
        ? sorted.findIndex((candidate) => candidate.total === result.total) + 1
        : index + 1,
  }));
}
