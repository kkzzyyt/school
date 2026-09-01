import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { timetableSaveSchema } from "@/server/validation/timetable";

import { toSlotView } from "./_lib";

function normalizeOptionalText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

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
    const [courses, teachers, periods, entries] = await Promise.all([
      prisma.course.findMany({ orderBy: { name: "asc" } }),
      prisma.teacher.findMany({
        where: { classId: context.classId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
      prisma.timetablePeriod.findMany({
        where: { classId: context.classId },
        orderBy: [{ sortOrder: "asc" }, { period: "asc" }],
      }),
      prisma.timetableEntry.findMany({
        where: { classId: context.classId },
        include: { course: true, teacher: true, periodSlot: true },
        orderBy: [{ period: "asc" }, { weekday: "asc" }],
      }),
    ]);

    return {
      courses,
      teachers,
      periods,
      slots: toSlotView(periods),
      entries: entries.map((entry) => ({
        ...entry,
        slotId: entry.periodSlot?.id ?? null,
        teacherName: entry.teacher?.name ?? entry.teacherName,
      })),
    };
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = timetableSaveSchema.parse(await request.json());

    const [courses, teachers, periods] = await Promise.all([
      prisma.course.findMany({
        where: { id: { in: [...new Set(input.entries.map((entry) => entry.courseId))] } },
        select: { id: true },
      }),
      prisma.teacher.findMany({
        where: { classId: context.classId },
        select: { id: true, name: true },
      }),
      prisma.timetablePeriod.findMany({
        where: { classId: context.classId },
        select: { id: true, period: true },
      }),
    ]);

    const courseIds = new Set(input.entries.map((entry) => entry.courseId));
    if (courses.length !== courseIds.size) {
      throw new ApiError(400, "VALIDATION_ERROR", "课表中包含无效课程");
    }

    const teacherById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
    const teacherByName = new Map(teachers.map((teacher) => [teacher.name, teacher]));
    const explicitTeacherIds = [
      ...new Set(
        input.entries
          .map((entry) => entry.teacherId)
          .filter((teacherId): teacherId is string => Boolean(teacherId)),
      ),
    ];
    if (explicitTeacherIds.some((teacherId) => !teacherById.has(teacherId))) {
      throw new ApiError(403, "FORBIDDEN", "课表中包含无权访问的任课教师");
    }

    const periodById = new Map(periods.map((period) => [period.id, period]));
    const periodByNumber = new Map(periods.map((period) => [period.period, period]));
    const resolvedEntries = input.entries.map((entry) => {
      const normalizedTeacherName = normalizeOptionalText(entry.teacherName);
      const periodSlot = entry.periodId
        ? periodById.get(entry.periodId)
        : entry.period === undefined
          ? undefined
          : periodByNumber.get(entry.period);
      if (entry.periodId && !periodSlot) {
        throw new ApiError(400, "VALIDATION_ERROR", "课表中包含无效时段");
      }

      const teacher = entry.teacherId
        ? teacherById.get(entry.teacherId)
        : normalizedTeacherName
          ? teacherByName.get(normalizedTeacherName)
          : undefined;
      const period = periodSlot?.period ?? entry.period;
      if (period === undefined) {
        throw new ApiError(400, "VALIDATION_ERROR", "请提供课程节次或时段 ID");
      }

      return {
        courseId: entry.courseId,
        weekday: entry.weekday,
        period,
        periodId: periodSlot?.id ?? null,
        teacherId: teacher?.id ?? null,
        teacherName: teacher?.name ?? normalizedTeacherName,
        room: normalizeOptionalText(entry.room),
      };
    });

    const positions = resolvedEntries.map((entry) => `${entry.weekday}:${entry.period}`);
    if (new Set(positions).size !== positions.length) {
      throw new ApiError(400, "VALIDATION_ERROR", "同一节次只能安排一门课程");
    }

    if (input.periods) {
      assertCompletePeriodOrder(input.periods, periods);
    }

    await prisma.$transaction(async (transaction) => {
      if (input.periods) {
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
      }

      await transaction.timetableEntry.deleteMany({ where: { classId: context.classId } });
      if (resolvedEntries.length > 0) {
        await transaction.timetableEntry.createMany({
          data: resolvedEntries.map((entry) => ({
            ...entry,
            classId: context.classId,
          })),
        });
      }
    });

    return { count: resolvedEntries.length };
  });
}
