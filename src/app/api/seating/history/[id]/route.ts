import type { SeatingEnvironment } from "@/domain/seating";
import type { SeatingHistoryAssignment, SeatingHistoryDetail } from "@/domain/seating-history";
import { ApiError, handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const { id } = await routeContext.params;

    const record = await prisma.seatingHistory.findFirst({
      where: { id, classId: context.classId },
    });

    if (!record) {
      notFound("座次历史记录不存在");
    }

    const detail: SeatingHistoryDetail = {
      id: record.id,
      classId: record.classId,
      operatorId: record.operatorId,
      operatorName: record.operatorName,
      triggerType: record.triggerType,
      description: record.description,
      rows: record.rows,
      columns: record.columns,
      studentCount: record.studentCount,
      assignments: (record.assignments as unknown as SeatingHistoryAssignment[]) ?? [],
      environment: (record.environment as unknown as SeatingEnvironment) ?? {
        aisleAfterColumns: [],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: { waterDispenser: null, airConditioner: null },
      },
      createdAt: record.createdAt.toISOString(),
    };

    return detail;
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;

    const record = await prisma.seatingHistory.findFirst({
      where: { id, classId: context.classId },
      select: { id: true },
    });

    if (!record) {
      notFound("座次历史记录不存在");
    }

    const latest = await prisma.seatingHistory.findFirst({
      where: { classId: context.classId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });

    if (latest && latest.id === id) {
      throw new ApiError(400, "VALIDATION_ERROR", "当前最新的生效座次记录无法删除");
    }

    await prisma.seatingHistory.delete({
      where: { id },
    });

    return { success: true };
  });
}
