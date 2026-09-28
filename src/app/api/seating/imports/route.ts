import { ApiError, handleApi } from "@/server/api/errors";
import { parseSeatingOcrLines } from "@/domain/seating-ocr";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  getSeatingImportSourceType,
  MAX_SEATING_IMPORT_BYTES,
  parseExistingEnvironment,
  parseSeatingImportFile,
} from "@/server/services/seating-import";
import { detectSeatingImageMime, recognizeSeatingImage } from "@/server/services/seating-ocr";

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
      throw new ApiError(400, "VALIDATION_ERROR", "只支持 CSV、XLSX、PNG、JPEG 或 WebP 文件");
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
    const buffer = await upload.arrayBuffer();
    if (sourceType === "IMAGE") {
      const bytes = new Uint8Array(buffer);
      const mime = detectSeatingImageMime(bytes);
      if (!mime) {
        throw new ApiError(400, "VALIDATION_ERROR", "文件内容不是有效的 PNG、JPEG 或 WebP 图片");
      }
      const ocr = await recognizeSeatingImage(bytes, mime);
      const preview = parseSeatingOcrLines(ocr, students, {
        sourceType: "IMAGE",
        existingEnvironment: parseExistingEnvironment(classroom?.seatingEnvironment, rows, columns),
      });
      return { fileName, sourceType, ...preview };
    }

    let preview;
    try {
      preview = await parseSeatingImportFile({
        filename: fileName,
        buffer,
        students,
        rows,
        columns,
        environment: classroom?.seatingEnvironment,
      });
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "座位文件无法解析，请检查文件格式");
    }

    return {
      fileName,
      sourceType: preview.sourceType,
      ...preview.preview,
    };
  });
}
