import { describe, expect, it } from "vitest";

import { parseSeatingOcrLines } from "./seating-ocr";

const students = [
  { id: "s-1", name: "张三", studentNo: "001" },
  { id: "s-2", name: "李四", studentNo: "002" },
  { id: "s-3", name: "王五", studentNo: "003" },
];

function line(text: string, x: number, y: number, score = 0.98) {
  return { text, score, box: [x - 25, y - 12, x + 25, y + 12] as [number, number, number, number] };
}

describe("parseSeatingOcrLines", () => {
  it("maps labelled rows and columns to student seats and preserves an aisle", () => {
    const result = parseSeatingOcrLines({
      width: 500,
      height: 300,
      lines: [
        line("排\\座", 50, 50),
        line("第1座", 170, 50),
        line("过道", 250, 50),
        line("第2座", 340, 50),
        line("第2排", 50, 120),
        line("张三", 170, 120),
        line("李四", 340, 120),
        line("第1排", 50, 200),
        line("王五", 170, 200),
        line("讲台", 250, 270),
      ],
    }, students);

    expect(result.draft).toMatchObject({
      rows: 2,
      columns: 2,
      orientation: "FRONT_BOTTOM",
      environment: { aisleAfterColumns: [1] },
      assignments: [
        { studentId: "s-3", row: 1, column: 1 },
        { studentId: "s-1", row: 2, column: 1 },
        { studentId: "s-2", row: 2, column: 2 },
      ],
    });
    expect(result.issues).toEqual([]);
  });

  it("marks uncertain OCR text for teacher review", () => {
    const result = parseSeatingOcrLines({
      width: 400,
      height: 220,
      lines: [
        line("第1座", 150, 40),
        line("第1排", 35, 110),
        line("张三", 150, 110, 0.52),
      ],
    }, students);

    expect(result.draft.assignments).toEqual([{ studentId: "s-1", row: 1, column: 1 }]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "LOW_OCR_CONFIDENCE", row: 1, column: 1 }),
    ]));
  });

  it("returns a reviewable error instead of guessing positions when labels are missing", () => {
    const result = parseSeatingOcrLines({
      width: 400,
      height: 220,
      lines: [line("张三", 120, 80), line("李四", 280, 80)],
    }, students);

    expect(result.draft.assignments).toEqual([]);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "OCR_LAYOUT_UNCERTAIN" }),
    ]));
  });
});
