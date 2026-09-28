import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";

import { createDefaultSeatingEnvironment } from "@/domain/seating";
import { parseSeatingImportFile } from "./seating-import";

const students = [
  { id: "s-1", name: "张三", studentNo: "001" },
  { id: "s-2", name: "李四", studentNo: "002" },
];

function bufferFrom(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe("server/services/seating-import", () => {
  it("parses CSV uploads using the current class roster", () => {
    const result = parseSeatingImportFile({
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

  it("reads the first worksheet from XLSX uploads", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["排", "座", "姓名"],
      [1, 1, "张三"],
      [1, 2, "李四"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "座位表");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;

    const result = parseSeatingImportFile({
      filename: "座次.xlsx",
      buffer: bytes,
      students,
      rows: 2,
      columns: 4,
      environment: createDefaultSeatingEnvironment(4),
    });

    expect(result.sourceType).toBe("XLSX");
    expect(result.preview.stats.matched).toBe(2);
    expect(result.preview.draft.assignments).toHaveLength(2);
  });
});
