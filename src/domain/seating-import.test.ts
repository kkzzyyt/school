import { describe, expect, it } from "vitest";

import {
  parseDelimitedText,
  parseSeatingMatrix,
  type SeatingImportStudent,
} from "./seating-import";

const students: SeatingImportStudent[] = [
  { id: "s-1", name: "张三", studentNo: "001" },
  { id: "s-2", name: "李四", studentNo: "002" },
  { id: "s-3", name: "王五", studentNo: "003" },
];

describe("domain/seating-import", () => {
  it("parses quoted delimiters and escaped quotes in CSV text", () => {
    expect(parseDelimitedText('姓名,备注\n"张三","喜欢,数学"\n"李""四","正常"')).toEqual([
      ["姓名", "备注"],
      ["张三", "喜欢,数学"],
      ['李"四', "正常"],
    ]);
  });

  it("recognizes the exported seating matrix, aisles, orientation, and student numbers", () => {
    const result = parseSeatingMatrix([
      ["高二（3）班座次表", "", "", "", "", ""],
      ["", "排\\座", "第 1 座", "过道", "第 2 座", ""],
      ["", "第 1 排", "001", "", "李四", ""],
      ["", "第 2 排", "", "", "", ""],
      ["", "讲台", "", "", "", ""],
    ], students);

    expect(result.draft).toMatchObject({
      rows: 2,
      columns: 2,
      orientation: "FRONT_BOTTOM",
      environment: expect.objectContaining({ aisleAfterColumns: [1] }),
      assignments: [
        { studentId: "s-1", row: 1, column: 1 },
        { studentId: "s-2", row: 1, column: 2 },
      ],
    });
    expect(result.stats).toMatchObject({ matched: 2, unmatched: 0, duplicate: 0 });
  });

  it("accepts a simple row/column/name detail list", () => {
    const result = parseSeatingMatrix([
      ["排", "座", "姓名"],
      ["1", "2", "张三"],
      ["2", "1", "002"],
    ], students);

    expect(result.draft.assignments).toEqual([
      { studentId: "s-1", row: 1, column: 2 },
      { studentId: "s-2", row: 2, column: 1 },
    ]);
    expect(result.draft.rows).toBe(2);
    expect(result.draft.columns).toBe(2);
  });

  it("reports unmatched and duplicate students without producing invalid assignments", () => {
    const result = parseSeatingMatrix([
      ["排\\座", "第 1 座", "第 2 座"],
      ["第 1 排", "张三", "不存在"],
      ["第 2 排", "001", ""],
    ], students);

    expect(result.draft.assignments).toEqual([{ studentId: "s-1", row: 1, column: 1 }]);
    expect(result.stats).toMatchObject({ matched: 1, unmatched: 1, duplicate: 1 });
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "UNMATCHED_STUDENT", row: 1, column: 2 }),
      expect.objectContaining({ code: "DUPLICATE_STUDENT", row: 2, column: 1 }),
    ]));
  });
});
