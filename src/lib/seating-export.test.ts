import { describe, expect, it } from "vitest";

import {
  buildSeatingMatrix,
  buildSeatingRosterRows,
  getSeatingExportFilename,
} from "./seating-export";

const students = [
  { id: "s-1", name: "张三", studentNo: "001" },
  { id: "s-2", name: "李四", studentNo: "002" },
  { id: "s-3", name: "王五", studentNo: "003" },
];

const assignments = [
  { studentId: "s-2", row: 2, column: 1 },
  { studentId: "s-1", row: 1, column: 3 },
];

describe("seating export", () => {
  it("builds a seat matrix with row and column labels", () => {
    expect(buildSeatingMatrix({ rows: 2, columns: 3, students, assignments })).toEqual([
      ["班级座次表", "", "", ""],
      ["面向讲台 · 2 排 · 3 个座位/排", "", "", ""],
      ["排\\座", "第 1 座", "第 2 座", "第 3 座"],
      ["第 1 排", "空座", "空座", "张三"],
      ["第 2 排", "李四", "空座", "空座"],
    ]);
  });

  it("lists assigned students first and keeps unassigned students", () => {
    expect(buildSeatingRosterRows({ rows: 2, columns: 3, students, assignments })).toEqual([
      { 排: 1, 座: 3, 姓名: "张三", 状态: "已安排" },
      { 排: 2, 座: 1, 姓名: "李四", 状态: "已安排" },
      { 排: "", 座: "", 姓名: "王五", 状态: "未分配" },
    ]);
  });

  it("escapes formula-like text and creates a date-stamped filename", () => {
    const matrix = buildSeatingMatrix({
      rows: 1,
      columns: 1,
      students: [{ id: "s-danger", name: "=HYPERLINK(\"https://example.com\")", studentNo: "@001" }],
      assignments: [{ studentId: "s-danger", row: 1, column: 1 }],
    });

    expect(matrix[3][1]).toBe("'=HYPERLINK(\"https://example.com\")");
    expect(buildSeatingRosterRows({
      rows: 1,
      columns: 1,
      students: [{ id: "s-danger", name: "正常", studentNo: "@001" }],
      assignments: [{ studentId: "s-danger", row: 1, column: 1 }],
    })[0]).not.toHaveProperty("学号");
    expect(getSeatingExportFilename(new Date(2026, 8, 2))).toBe("班级座次表-20260902.xlsx");
  });

  it("does not turn an invalid assignment into a misleading empty seat", () => {
    expect(buildSeatingMatrix({
      rows: 1,
      columns: 2,
      students: [],
      assignments: [
        { studentId: "missing", row: 1, column: 1 },
        { studentId: "out-of-range", row: 2, column: 2 },
      ],
    })[3]).toEqual(["第 1 排", "未知学生", "空座"]);
  });
});
