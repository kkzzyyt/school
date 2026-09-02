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

  it("builds a classroom template with the podium, aisles, and side markers", () => {
    expect(buildSeatingMatrix({
      rows: 2,
      columns: 3,
      students,
      assignments,
      environment: {
        aisleAfterColumns: [1],
        left: { windows: [1, 7], doorRows: [2] },
        right: { windows: [2], doorRows: [1] },
        rear: { waterDispenser: null, airConditioner: null },
      },
    })).toEqual([
      ["班级座次表", "", "", "", "", "", ""],
      ["面向讲台 · 2 排 · 3 个座位/排", "", "", "", "", "", ""],
      ["前方", "讲台", "", "", "", "", ""],
      ["左侧", "排\\座", "第 1 座", "过道", "第 2 座", "第 3 座", "右侧"],
      ["窗户", "第 1 排", "空座", "", "空座", "张三", "门口"],
      ["门口", "第 2 排", "李四", "", "空座", "空座", "窗户"],
      ["", "第 3 排", "", "", "", "", ""],
      ["", "第 4 排", "", "", "", "", ""],
      ["", "第 5 排", "", "", "", "", ""],
      ["", "第 6 排", "", "", "", "", ""],
      ["窗户", "第 7 排", "", "", "", "", ""],
      ["后方", "教室后墙", "", "", "", "", ""],
    ]);
  });

  it("keeps original seat coordinates when multiple aisles add visual tracks", () => {
    const matrix = buildSeatingMatrix({
      rows: 1,
      columns: 4,
      students,
      assignments: [
        { studentId: "s-1", row: 1, column: 2 },
        { studentId: "s-2", row: 1, column: 4 },
      ],
      environment: {
        aisleAfterColumns: [1, 3],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: null, airConditioner: null },
      },
    });

    expect(matrix[4]).toEqual([
      "",
      "第 1 排",
      "空座",
      "",
      "张三",
      "空座",
      "",
      "李四",
      "",
    ]);
  });

  it("includes fixed facilities on each classroom boundary", () => {
    const sideFacilities = buildSeatingMatrix({
      rows: 2,
      columns: 3,
      students: [],
      assignments: [],
      environment: {
        aisleAfterColumns: [],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: null, airConditioner: null },
        fixedFacilities: {
          waterDispenser: { side: "LEFT", position: 2 },
          airConditioner: { side: "RIGHT", position: 1 },
        },
      },
    });
    const endFacilities = buildSeatingMatrix({
      rows: 2,
      columns: 4,
      students: [],
      assignments: [],
      environment: {
        aisleAfterColumns: [],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: null, airConditioner: null },
        fixedFacilities: {
          waterDispenser: { side: "FRONT", position: 3 },
          airConditioner: { side: "BACK", position: 4 },
        },
      },
    });

    expect(sideFacilities[4].at(-1)).toBe("空调");
    expect(sideFacilities[5][0]).toBe("饮水机");
    expect(endFacilities[2][1]).toBe("讲台 · 饮水机（第 3 座）");
    expect(endFacilities.at(-1)?.[1]).toBe("教室后墙 · 空调（第 4 座）");
  });

  it("maps legacy rear facilities into the exported room edges", () => {
    const matrix = buildSeatingMatrix({
      rows: 7,
      columns: 4,
      students: [],
      assignments: [],
      environment: {
        aisleAfterColumns: [],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: "RIGHT", airConditioner: "CENTER" },
      },
    });

    expect(matrix[7].at(-1)).toBe("饮水机");
    expect(matrix.at(-1)?.[1]).toBe("教室后墙 · 空调（第 2 座）");
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
