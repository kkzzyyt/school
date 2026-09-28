import * as XLSX from "xlsx";

import {
  createDefaultSeatingEnvironment,
  validateSeatingEnvironment,
  type SeatingEnvironment,
  type SeatingEnvironmentInput,
} from "@/domain/seating";
import {
  parseDelimitedText,
  parseSeatingMatrix,
  type SeatingImportPreview,
  type SeatingImportSourceType,
  type SeatingImportStudent,
} from "@/domain/seating-import";

export const MAX_SEATING_IMPORT_BYTES = 5 * 1024 * 1024;

export interface SeatingImportFileInput {
  filename: string;
  buffer: ArrayBuffer;
  students: readonly SeatingImportStudent[];
  rows: number;
  columns: number;
  environment?: unknown;
}

function getExtension(filename: string): string {
  return filename.toLocaleLowerCase("zh-CN").split(".").at(-1) ?? "";
}

export function getSeatingImportSourceType(filename: string): SeatingImportSourceType | null {
  const extension = getExtension(filename);
  if (extension === "csv" || extension === "tsv") return "CSV";
  if (extension === "xlsx" || extension === "xls") return "XLSX";
  return null;
}

function readSpreadsheet(buffer: ArrayBuffer): string[][] {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array", cellText: true, cellDates: false });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];
  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  return rows.map((row) => Array.isArray(row) ? row.map((value) => String(value ?? "")) : []);
}

function numberList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.filter((item): item is number => Number.isInteger(item))
    : [];
}

function parseExistingEnvironment(
  value: unknown,
  rows: number,
  columns: number,
): SeatingEnvironment {
  const fallback = createDefaultSeatingEnvironment(columns);
  if (!value || typeof value !== "object") return fallback;

  const stored = value as Record<string, unknown>;
  const side = (input: unknown) => {
    const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
    return {
      windows: numberList(source.windows),
      doorRows: numberList(source.doorRows ?? (
        Number.isInteger(source.doorRow) ? [source.doorRow] : []
      )),
    };
  };
  const rear = stored.rear && typeof stored.rear === "object"
    ? stored.rear as Record<string, unknown>
    : {};
  const input: SeatingEnvironmentInput = {
    aisleAfterColumns: numberList(stored.aisleAfterColumns),
    left: side(stored.left),
    right: side(stored.right),
    rear: {
      waterDispenser: rear.waterDispenser === "LEFT" || rear.waterDispenser === "CENTER" || rear.waterDispenser === "RIGHT"
        ? rear.waterDispenser
        : null,
      airConditioner: rear.airConditioner === "LEFT" || rear.airConditioner === "CENTER" || rear.airConditioner === "RIGHT"
        ? rear.airConditioner
        : null,
    },
    disabledSeats: Array.isArray(stored.disabledSeats) ? stored.disabledSeats as SeatingEnvironmentInput["disabledSeats"] : undefined,
    lockedSeats: Array.isArray(stored.lockedSeats) ? stored.lockedSeats as SeatingEnvironmentInput["lockedSeats"] : undefined,
  };

  try {
    return validateSeatingEnvironment(input, rows, columns, { allowLegacySideRows: true });
  } catch {
    return fallback;
  }
}

export function parseSeatingImportFile(input: SeatingImportFileInput): {
  sourceType: SeatingImportSourceType;
  preview: SeatingImportPreview;
} {
  const sourceType = getSeatingImportSourceType(input.filename);
  if (!sourceType) {
    throw new Error("不支持的座位文件格式，请上传 CSV、XLSX 或 XLS 文件");
  }

  const matrix = sourceType === "CSV"
    ? parseDelimitedText(new TextDecoder("utf-8").decode(input.buffer))
    : readSpreadsheet(input.buffer);
  const preview = parseSeatingMatrix(matrix, input.students, {
    sourceType,
    existingEnvironment: parseExistingEnvironment(input.environment, input.rows, input.columns),
  });

  return { sourceType, preview };
}
