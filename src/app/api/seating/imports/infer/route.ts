import { z } from "zod";

import {
  inferSeatingRuleCandidates,
  type SeatingRuleSnapshot,
} from "@/domain/seating-rule-inference";
import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

const requestSchema = z.object({
  historyIds: z.array(z.string().min(1)).max(12).optional(),
}).default({});

function toSnapshot(record: {
  rows: number;
  columns: number;
  assignments: unknown;
}): SeatingRuleSnapshot | null {
  if (!Array.isArray(record.assignments)) return null;
  const assignments = record.assignments.filter((assignment): assignment is SeatingRuleSnapshot["assignments"][number] => (
    typeof assignment === "object"
    && assignment !== null
    && typeof (assignment as { studentId?: unknown }).studentId === "string"
    && Number.isInteger((assignment as { row?: unknown }).row)
    && Number.isInteger((assignment as { column?: unknown }).column)
  )).map((assignment) => ({
    studentId: assignment.studentId,
    row: assignment.row,
    column: assignment.column,
  }));
  return { rows: record.rows, columns: record.columns, assignments };
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    let input: z.infer<typeof requestSchema>;
    try {
      input = requestSchema.parse(await request.json());
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "规律分析参数不正确");
    }

    const records = await prisma.seatingHistory.findMany({
      where: {
        classId: context.classId,
        ...(input.historyIds ? { id: { in: input.historyIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, rows: true, columns: true, assignments: true, createdAt: true },
    });
    const snapshots = records
      .slice()
      .reverse()
      .map(toSnapshot)
      .filter((snapshot): snapshot is SeatingRuleSnapshot => snapshot !== null);

    return {
      snapshotCount: snapshots.length,
      candidates: snapshots.length >= 2 ? inferSeatingRuleCandidates(snapshots) : [],
    };
  });
}
