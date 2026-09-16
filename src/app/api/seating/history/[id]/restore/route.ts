import { Prisma } from "@/generated/prisma/client";
import {
  MAX_SEATING_HISTORY_COUNT,
  buildHistoryAssignmentsSnapshot,
  filterRestorableAssignments,
  type SeatingHistoryAssignment,
} from "@/domain/seating-history";
import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;

    const history = await prisma.seatingHistory.findFirst({
      where: { id, classId: context.classId },
    });

    if (!history) {
      notFound("座次历史记录不存在");
    }

    const activeStudents = await prisma.student.findMany({
      where: { classId: context.classId, status: "ACTIVE" },
      select: { id: true, name: true, studentNo: true, gender: true },
    });

    const historyAssignments = (history.assignments as unknown as SeatingHistoryAssignment[]) ?? [];
    const { validAssignments, skippedAssignments } = filterRestorableAssignments(
      historyAssignments,
      activeStudents,
      history.rows,
      history.columns,
    );

    await prisma.$transaction(async (transaction) => {
      await transaction.classroom.update({
        where: { id: context.classId },
        data: {
          seatRows: history.rows,
          seatColumns: history.columns,
          seatingEnvironment: history.environment as Prisma.InputJsonValue,
        },
      });

      await transaction.seatAssignment.deleteMany({
        where: { classId: context.classId },
      });

      if (validAssignments.length > 0) {
        await transaction.seatAssignment.createMany({
          data: validAssignments.map((assignment) => ({
            ...assignment,
            classId: context.classId,
          })),
        });
      }

      const restoreSnapshot = buildHistoryAssignmentsSnapshot(validAssignments, activeStudents);
      const restoreDateStr = new Date(history.createdAt).toLocaleString("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      await transaction.seatingHistory.create({
        data: {
          classId: context.classId,
          operatorId: context.userId,
          operatorName: context.displayName,
          triggerType: "RESTORE",
          description: history.description
            ? `恢复版本: ${history.description}`
            : `恢复至 ${restoreDateStr} 版本`,
          rows: history.rows,
          columns: history.columns,
          studentCount: validAssignments.length,
          assignments: restoreSnapshot as unknown as Prisma.InputJsonValue,
          environment: history.environment as Prisma.InputJsonValue,
        },
      });

      const excessHistories = await transaction.seatingHistory.findMany({
        where: { classId: context.classId },
        orderBy: { createdAt: "desc" },
        skip: MAX_SEATING_HISTORY_COUNT,
        select: { id: true },
      });

      if (excessHistories.length > 0) {
        await transaction.seatingHistory.deleteMany({
          where: { id: { in: excessHistories.map((h) => h.id) } },
        });
      }
    });

    return {
      restoredCount: validAssignments.length,
      skippedStudents: skippedAssignments.map((s) => ({
        studentId: s.studentId,
        studentName: s.studentName,
      })),
      rows: history.rows,
      columns: history.columns,
      environment: history.environment,
      assignments: validAssignments,
    };
  });
}
