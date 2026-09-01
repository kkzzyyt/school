import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  timetablePeriodInputSchema,
  timetablePeriodPatchSchema,
} from "@/server/validation/timetable";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const period = await prisma.timetablePeriod.findFirst({
      where: { id, classId: context.classId },
    });
    if (!period) notFound("课程时段不存在");
    return period;
  });
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const input = timetablePeriodPatchSchema.parse(await request.json());
    const existing = await prisma.timetablePeriod.findFirst({
      where: { id, classId: context.classId },
    });
    if (!existing) notFound("课程时段不存在");

    timetablePeriodInputSchema.parse({
      period: existing.period,
      name: input.name ?? existing.name,
      type: input.type ?? existing.type,
      startTime: input.startTime ?? existing.startTime,
      endTime: input.endTime ?? existing.endTime,
      sortOrder: input.sortOrder ?? existing.sortOrder,
    });

    return prisma.timetablePeriod.update({ where: { id }, data: input });
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const deleted = await prisma.timetablePeriod.deleteMany({
      where: { id, classId: context.classId },
    });
    if (deleted.count === 0) notFound("课程时段不存在");
    return null;
  });
}
