import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  getSeatingImportSourceType,
  MAX_SEATING_IMPORT_BYTES,
  parseSeatingImportFile,
} from "@/server/services/seating-import";

function isUpload(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value
    && typeof value !== "string"
    && typeof value.arrayBuffer === "function"
  );
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    if (!request.headers.get("content-type")?.startsWith("multipart/form-data")) {
      throw new ApiError(400, "VALIDATION_ERROR", "请选择座位 CSV 或 Excel 文件");
    }
    const formData = await request.formData();
    const upload = formData.get("file");
    if (!isUpload(upload)) {
      throw new ApiError(400, "VALIDATION_ERROR", "请选择座位 CSV 或 Excel 文件");
    }

    const fileNameEntry = formData.get("fileName");
    const uploadName = typeof upload.name === "string" ? upload.name : "";
    const fileName = (!uploadName || uploadName === "blob") && typeof fileNameEntry === "string"
      ? fileNameEntry
      : uploadName;
    const sourceType = getSeatingImportSourceType(fileName);
    if (!sourceType) {
      throw new ApiError(400, "VALIDATION_ERROR", "只支持 CSV、XLSX 或 XLS 文件");
    }
    if (upload.size > MAX_SEATING_IMPORT_BYTES) {
      throw new ApiError(400, "VALIDATION_ERROR", "座位文件不能超过 5 MB");
    }

    const [classroom, students] = await Promise.all([
      prisma.classroom.findUnique({
        where: { id: context.classId },
        select: { seatRows: true, seatColumns: true, seatingEnvironment: true },
      }),
      prisma.student.findMany({
        where: { classId: context.classId, status: "ACTIVE" },
        select: { id: true, name: true, studentNo: true },
        orderBy: { studentNo: "asc" },
      }),
    ]);

    const rows = classroom?.seatRows ?? 7;
    const columns = classroom?.seatColumns ?? 8;
    const preview = parseSeatingImportFile({
      filename: fileName,
      buffer: await upload.arrayBuffer(),
      students,
      rows,
      columns,
      environment: classroom?.seatingEnvironment,
    });

    return {
      fileName,
      sourceType: preview.sourceType,
      ...preview.preview,
    };
  });
}
