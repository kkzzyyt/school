import { describe, expect, it } from "vitest";
import writeExcelFile from "write-excel-file/node";

import { createDefaultSeatingEnvironment } from "@/domain/seating";
import { buildSeatingMatrix } from "@/lib/seating-export";
import { parseSeatingImportFile } from "./seating-import";

const students = [
  { id: "s-1", name: "张三", studentNo: "001" },
  { id: "s-2", name: "李四", studentNo: "002" },
];

function bufferFrom(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe("server/services/seating-import", () => {
  it("parses CSV uploads using the current class roster", async () => {
    const result = await parseSeatingImportFile({
      filename: "座次.csv",
      buffer: bufferFrom("排,座,学号\n1,1,001\n1,2,李四"),
      students,
      rows: 2,
      columns: 4,
      environment: createDefaultSeatingEnvironment(4),
    });

    expect(result.sourceType).toBe("CSV");
    expect(result.preview.draft.assignments).toEqual([
      { studentId: "s-1", row: 1, column: 1 },
      { studentId: "s-2", row: 1, column: 2 },
    ]);
  });

  it("reads the first worksheet from XLSX uploads", async () => {
    const bytes = await writeExcelFile([
      [{ value: "排" }, { value: "座" }, { value: "姓名" }],
      [{ value: 1 }, { value: 1 }, { value: "张三" }],
      [{ value: 1 }, { value: 2 }, { value: "李四" }],
    ]).toBuffer();

    const result = await parseSeatingImportFile({
      filename: "座次.xlsx",
      buffer: Uint8Array.from(bytes).buffer,
      students,
      rows: 2,
      columns: 4,
      environment: createDefaultSeatingEnvironment(4),
    });

    expect(result.sourceType).toBe("XLSX");
    expect(result.preview.stats.matched).toBe(2);
    expect(result.preview.draft.assignments).toHaveLength(2);
  });

  it("round-trips the system's exported XLSX seat matrix", async () => {
    const matrix = buildSeatingMatrix({
      className: "高二（3）班",
      rows: 2,
      columns: 2,
      students,
      assignments: [
        { studentId: "s-1", row: 1, column: 1 },
        { studentId: "s-2", row: 2, column: 2 },
      ],
      environment: createDefaultSeatingEnvironment(2),
      podiumPosition: "BOTTOM",
      mirrorColumns: true,
    });
    const bytes = await writeExcelFile(matrix.map((row) => row.map(
      (value) => value ? { value } : null,
    ))).toBuffer();

    const result = await parseSeatingImportFile({
      filename: "系统导出.xlsx",
      buffer: Uint8Array.from(bytes).buffer,
      students,
      rows: 2,
      columns: 2,
      environment: createDefaultSeatingEnvironment(2),
    });

    expect(result.preview.draft.assignments).toEqual([
      { studentId: "s-1", row: 1, column: 1 },
      { studentId: "s-2", row: 2, column: 2 },
    ]);
    expect(result.preview.draft.environment.aisleAfterColumns).toEqual([1]);
    expect(result.preview.issues).toEqual([]);
  });

  it("preserves existing fixed facilities in an imported draft", async () => {
    const result = await parseSeatingImportFile({
      filename: "座次.csv",
      buffer: bufferFrom("排,座,学号\n1,1,001"),
      students,
      rows: 2,
      columns: 4,
      environment: {
        ...createDefaultSeatingEnvironment(4),
        fixedFacilities: {
          waterDispenser: { side: "LEFT", position: 1 },
          airConditioner: null,
        },
      },
    });

    expect(result.preview.draft.environment.fixedFacilities).toEqual({
      waterDispenser: { side: "LEFT", position: 1 },
      airConditioner: null,
    });
  });
});
