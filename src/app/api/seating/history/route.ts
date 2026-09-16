import { MAX_SEATING_HISTORY_COUNT, type SeatingHistorySummary } from "@/domain/seating-history";
import { handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();

    const records = await prisma.seatingHistory.findMany({
      where: { classId: context.classId },
      orderBy: { createdAt: "desc" },
      take: MAX_SEATING_HISTORY_COUNT,
      select: {
        id: true,
        classId: true,
        operatorId: true,
        operatorName: true,
        triggerType: true,
        description: true,
        rows: true,
        columns: true,
        studentCount: true,
        createdAt: true,
      },
    });

    const histories: SeatingHistorySummary[] = records.map((record) => ({
      id: record.id,
      classId: record.classId,
      operatorId: record.operatorId,
      operatorName: record.operatorName,
      triggerType: record.triggerType,
      description: record.description,
      rows: record.rows,
      columns: record.columns,
      studentCount: record.studentCount,
      createdAt: record.createdAt.toISOString(),
    }));

    return { histories };
  });
}
