import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  timetablePeriodInputSchema,
  timetablePeriodReorderSchema,
} from "@/server/validation/timetable";

import { toSlotView } from "../_lib";

function assertCompletePeriodOrder(
  requested: Array<{ id: string; sortOrder: number }>,
  existing: Array<{ id: string }>,
): void {
  const requestedIds = new Set(requested.map((period) => period.id));
  const existingIds = new Set(existing.map((period) => period.id));
  const sortOrders = new Set(requested.map((period) => period.sortOrder));

  if (
    requested.length !== existing.length ||
    requestedIds.size !== requested.length ||
    requestedIds.size !== existingIds.size ||
    [...requestedIds].some((id) => !existingIds.has(id))
  ) {
    throw new ApiError(400, "VALIDATION_ERROR", "时段排序必须包含当前班级的全部时段");
  }
  if (sortOrders.size !== requested.length) {
    throw new ApiError(400, "VALIDATION_ERROR", "时段排序不能重复");
  }
}

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const periods = await prisma.timetablePeriod.findMany({
      where: { classId: context.classId },
      orderBy: [{ sortOrder: "asc" }, { period: "asc" }],
    });
    return { periods, slots: toSlotView(periods) };
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = timetablePeriodInputSchema.parse(await request.json());
    const current = await prisma.timetablePeriod.aggregate({
      where: { classId: context.classId },
      _max: { period: true, sortOrder: true },
    });

    const period = await prisma.timetablePeriod.create({
      data: {
        classId: context.classId,
        period: input.period ?? (current._max.period ?? 0) + 1,
        name: input.name,
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime,
        sortOrder: input.sortOrder ?? (current._max.sortOrder ?? 0) + 1,
      },
    });
    return period;
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = timetablePeriodReorderSchema.parse(await request.json());
    const existing = await prisma.timetablePeriod.findMany({
      where: { classId: context.classId },
      select: { id: true },
    });
    assertCompletePeriodOrder(input.periods, existing);

    await prisma.$transaction(async (transaction) => {
      await transaction.timetablePeriod.updateMany({
        where: { classId: context.classId },
        data: { sortOrder: { increment: 2_000_000 } },
      });
      for (const period of input.periods) {
        await transaction.timetablePeriod.update({
          where: { id: period.id },
          data: { sortOrder: period.sortOrder },
        });
      }
    });

    const periods = await prisma.timetablePeriod.findMany({
      where: { classId: context.classId },
      orderBy: [{ sortOrder: "asc" }, { period: "asc" }],
    });
    return { periods, slots: toSlotView(periods) };
  });
}
