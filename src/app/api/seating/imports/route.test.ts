import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  prisma: {
    classroom: { findUnique: vi.fn() },
    student: { findMany: vi.fn() },
  },
  parseSeatingImportFile: vi.fn(),
}));

vi.mock("@/server/auth/context", () => ({ requireAuthContext: mocks.requireAuthContext }));
vi.mock("@/server/auth/origin", () => ({ assertSameOrigin: mocks.assertSameOrigin }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/server/services/seating-import", () => ({
  MAX_SEATING_IMPORT_BYTES: 5 * 1024 * 1024,
  getSeatingImportSourceType: (filename: string) => {
    const extension = filename.split(".").at(-1)?.toLowerCase();
    return extension === "csv" ? "CSV" : extension === "xlsx" || extension === "xls" ? "XLSX" : null;
  },
  parseSeatingImportFile: mocks.parseSeatingImportFile,
}));

import { POST } from "./route";

const authContext = {
  userId: "user-1",
  username: "teacher",
  displayName: "周老师",
  userRole: "HEAD_TEACHER" as const,
  classId: "class-1",
  className: "高二（3）班",
  grade: "高二",
  room: "致远楼 302",
};

function uploadRequest(content: string, filename = "座次.csv") {
  const formData = new FormData();
  formData.append("file", new Blob([content], { type: "text/csv" }), filename);
  formData.append("fileName", filename);
  return new Request("https://school.example/api/seating/imports", {
    method: "POST",
    body: formData,
  });
}

async function responseBody(response: Response) {
  return (await response.json()) as {
    success: boolean;
    data?: { sourceType: string; stats: Record<string, number>; draft: { assignments: unknown[] } };
    error?: { code: string };
  };
}

describe("POST /api/seating/imports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    mocks.prisma.classroom.findUnique.mockResolvedValue({
      seatRows: 2,
      seatColumns: 4,
      seatingEnvironment: null,
    });
    mocks.prisma.student.findMany.mockResolvedValue([
      { id: "s-1", name: "张三", studentNo: "001" },
      { id: "s-2", name: "李四", studentNo: "002" },
    ]);
    mocks.parseSeatingImportFile.mockReturnValue({
      sourceType: "CSV",
      preview: {
        draft: {
          rows: 2,
          columns: 4,
          assignments: [
            { studentId: "s-1", row: 1, column: 1 },
            { studentId: "s-2", row: 1, column: 2 },
          ],
          environment: {
            aisleAfterColumns: [],
            left: { windows: [], doorRows: [] },
            right: { windows: [], doorRows: [] },
            rear: { waterDispenser: null, airConditioner: null },
          },
          orientation: "UNKNOWN",
          issues: [],
        },
        matches: [],
        issues: [],
        stats: { matched: 2, unmatched: 0, duplicate: 0, empty: 0, totalCells: 2 },
      },
    });
  });

  it("returns a validated CSV draft scoped to the authenticated class", async () => {
    const request = uploadRequest("排,座,学号\n1,1,001\n1,2,李四");
    const response = await POST(request);
    const body = await responseBody(response);
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      data: {
        sourceType: "CSV",
        stats: { matched: 2, unmatched: 0, duplicate: 0 },
        draft: { assignments: [
          { studentId: "s-1", row: 1, column: 1 },
          { studentId: "s-2", row: 1, column: 2 },
        ] },
      },
    });
    expect(mocks.prisma.classroom.findUnique).toHaveBeenCalledWith({
      where: { id: "class-1" },
      select: { seatRows: true, seatColumns: true, seatingEnvironment: true },
    });
    expect(mocks.prisma.student.findMany).toHaveBeenCalledWith({
      where: { classId: "class-1", status: "ACTIVE" },
      select: { id: true, name: true, studentNo: true },
      orderBy: { studentNo: "asc" },
    });
  });

  it("rejects unsupported file extensions before parsing", async () => {
    const response = await POST(uploadRequest("hello", "座次.txt"));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.classroom.findUnique).not.toHaveBeenCalled();
  });

  it("requires an uploaded file", async () => {
    const response = await POST(new Request("https://school.example/api/seating/imports", { method: "POST" }));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
  });
});
