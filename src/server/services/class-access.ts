import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

export async function assertStudentsBelongToClass(
  studentIds: string[],
  classId: string,
): Promise<void> {
  const uniqueIds = [...new Set(studentIds)];
  if (uniqueIds.length === 0) return;

  const ownedCount = await prisma.student.count({
    where: { id: { in: uniqueIds }, classId, status: "ACTIVE" },
  });
  if (ownedCount !== uniqueIds.length) {
    throw new ApiError(403, "FORBIDDEN", "请求中包含无权访问的学生");
  }
}
