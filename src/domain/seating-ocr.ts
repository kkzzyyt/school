import {
  parseSeatingMatrix,
  type SeatingImportPreview,
  type SeatingImportStudent,
  type SeatingMatrixOptions,
} from "./seating-import";

export interface SeatingOcrLine {
  text: string;
  score: number;
  box: [number, number, number, number];
}

export interface SeatingOcrResult {
  width: number;
  height: number;
  lines: SeatingOcrLine[];
}

const ROW_LABEL = /^第?\s*(\d{1,2})\s*排$/;
const COLUMN_LABEL = /^第?\s*(\d{1,2})\s*座$/;
const MIN_REVIEW_SCORE = 0.75;

function centerX(line: SeatingOcrLine): number {
  return (line.box[0] + line.box[2]) / 2;
}

function centerY(line: SeatingOcrLine): number {
  return (line.box[1] + line.box[3]) / 2;
}

function labelNumber(line: SeatingOcrLine, pattern: RegExp): number | null {
  const match = line.text.replace(/\s/g, "").match(pattern);
  const value = match ? Number(match[1]) : NaN;
  return Number.isInteger(value) && value >= 1 && value <= 12 ? value : null;
}

function closestLabel<T extends { center: number }>(labels: readonly T[], point: number): T | null {
  const ordered = [...labels].sort((left, right) => Math.abs(left.center - point) - Math.abs(right.center - point));
  const closest = ordered[0];
  if (!closest) return null;
  const neighborDistance = Math.min(
    ...labels.filter((label) => label !== closest).map((label) => Math.abs(label.center - closest.center)),
    Infinity,
  );
  const tolerance = Number.isFinite(neighborDistance) ? neighborDistance * 0.55 : 45;
  return Math.abs(closest.center - point) <= tolerance ? closest : null;
}

function uncertainLayout(
  students: readonly SeatingImportStudent[],
  options: SeatingMatrixOptions,
): SeatingImportPreview {
  const preview = parseSeatingMatrix([], students, options);
  const issues = [{
    code: "OCR_LAYOUT_UNCERTAIN" as const,
    message: "图片中未识别到完整的“第 N 排”和“第 N 座”标记，请使用清晰的座位图截图",
  }];
  return { ...preview, issues, draft: { ...preview.draft, issues } };
}

/** Reconstructs a labelled seat grid from local OCR boxes. Ambiguous layouts stay in review. */
export function parseSeatingOcrLines(
  result: SeatingOcrResult,
  students: readonly SeatingImportStudent[],
  options: SeatingMatrixOptions = {},
): SeatingImportPreview {
  const rowLabels = result.lines.flatMap((line) => {
    const row = labelNumber(line, ROW_LABEL);
    return row === null ? [] : [{ row, center: centerY(line) }];
  });
  const columnLabels = result.lines.flatMap((line) => {
    const column = labelNumber(line, COLUMN_LABEL);
    return column === null ? [] : [{ column, center: centerX(line) }];
  });
  if (
    rowLabels.length === 0
    || columnLabels.length === 0
    || new Set(rowLabels.map((label) => label.row)).size !== rowLabels.length
    || new Set(columnLabels.map((label) => label.column)).size !== columnLabels.length
    || Math.max(...rowLabels.map((label) => label.row)) !== rowLabels.length
    || Math.max(...columnLabels.map((label) => label.column)) !== columnLabels.length
  ) {
    return uncertainLayout(students, options);
  }

  const seatCells = new Map<string, SeatingOcrLine[]>();
  const aisles = new Set<number>();
  const orderedColumns = [...columnLabels].sort((left, right) => left.center - right.center);
  for (const line of result.lines) {
    const text = line.text.trim();
    if (text.includes("过道")) {
      const right = orderedColumns.find((column) => column.center > centerX(line));
      const left = [...orderedColumns].reverse().find((column) => column.center < centerX(line));
      if (left && right && Math.abs(left.column - right.column) === 1) {
        aisles.add(Math.min(left.column, right.column));
      }
      continue;
    }
    if (
      !text
      || labelNumber(line, ROW_LABEL) !== null
      || labelNumber(line, COLUMN_LABEL) !== null
      || /讲台|黑板|窗户|门口|饮水机|空调|后墙|座次表|排[\\/]座/.test(text)
    ) continue;

    const row = closestLabel(rowLabels, centerY(line));
    const column = closestLabel(columnLabels, centerX(line));
    if (!row || !column) continue;
    const key = `${row.row}:${column.column}`;
    seatCells.set(key, [...(seatCells.get(key) ?? []), line]);
  }

  const header = ["", "排\\座"];
  for (const label of orderedColumns) {
    header.push(`第 ${label.column} 座`);
    if (aisles.has(label.column)) header.push("过道");
  }
  const podium = result.lines.find((line) => line.text.includes("讲台"));
  const firstRowY = Math.min(...rowLabels.map((row) => row.center));
  const lastRowY = Math.max(...rowLabels.map((row) => row.center));
  const podiumTop = podium && centerY(podium) < firstRowY;
  const podiumBottom = podium && centerY(podium) > lastRowY;
  const matrix: string[][] = podiumTop ? [["", "讲台"], header] : [header];
  const scoreBySeat = new Map<string, number>();
  for (const rowLabel of [...rowLabels].sort((left, right) => left.center - right.center)) {
    const values = ["", `第 ${rowLabel.row} 排`];
    for (const columnLabel of orderedColumns) {
      const key = `${rowLabel.row}:${columnLabel.column}`;
      const lines = (seatCells.get(key) ?? []).sort((left, right) => centerX(left) - centerX(right));
      values.push(lines.map((line) => line.text.trim()).join(""));
      if (lines.length > 0) scoreBySeat.set(key, Math.min(...lines.map((line) => line.score)));
      if (aisles.has(columnLabel.column)) values.push("");
    }
    matrix.push(values);
  }
  if (podiumBottom) matrix.push(["", "讲台"]);

  const preview = parseSeatingMatrix(matrix, students, { ...options, sourceType: "IMAGE" });
  const reviewIssues = preview.matches.flatMap((match) => {
    const score = scoreBySeat.get(`${match.row}:${match.column}`);
    return score !== undefined && score < MIN_REVIEW_SCORE
      ? [{
        code: "LOW_OCR_CONFIDENCE" as const,
        message: `第 ${match.row} 排第 ${match.column} 座识别可信度较低，请核对“${match.sourceText}”`,
        row: match.row,
        column: match.column,
        sourceText: match.sourceText,
      }]
      : [];
  });
  const issues = [...preview.issues, ...reviewIssues];
  return { ...preview, issues, draft: { ...preview.draft, issues } };
}
