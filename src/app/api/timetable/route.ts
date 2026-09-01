import { z } from "zod";

import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

const timetableSchema = z.object({
  entries: z.array(
    z.object({
      courseId: z.string().min(1),
      weekday: z.number().int().min(1).max(7),
      period: z.number().int().min(1).max(12),
      teacherName: z.string().trim().max(50).optional().nullable(),
      room: z.string().trim().max(50).optional().nullable(),
    }),
  ),
});

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const [courses, entries] = await Promise.all([
      prisma.course.findMany({ orderBy: { name: "asc" } }),
      prisma.timetableEntry.findMany({
        where: { classId: context.classId },
        include: { course: true },
        orderBy: [{ period: "asc" }, { weekday: "asc" }],
      }),
    ]);
    return { courses, entries };
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = timetableSchema.parse(await request.json());
    const positions = input.entries.map((entry) => `${entry.weekday}:${entry.period}`);
    if (new Set(positions).size !== positions.length) {
      throw new ApiError(400, "VALIDATION_ERROR", "同一节次只能安排一门课程");
    }

    const courseIds = [...new Set(input.entries.map((entry) => entry.courseId))];
    const courseCount = await prisma.course.count({ where: { id: { in: courseIds } } });
    if (courseCount !== courseIds.length) {
      throw new ApiError(400, "VALIDATION_ERROR", "课表中包含无效课程");
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.timetableEntry.deleteMany({ where: { classId: context.classId } });
      if (input.entries.length > 0) {
        await transaction.timetableEntry.createMany({
          data: input.entries.map((entry) => ({ ...entry, classId: context.classId })),
        });
      }
    });
    return { count: input.entries.length };
  });
}
