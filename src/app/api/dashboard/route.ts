import { handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const weekday = new Date().getDay() || 7;

    const [studentCount, maleCount, femaleCount, courses, dutyGroups, workItems, recentExams] =
      await Promise.all([
        prisma.student.count({ where: { classId: context.classId, status: "ACTIVE" } }),
        prisma.student.count({
          where: { classId: context.classId, status: "ACTIVE", gender: "MALE" },
        }),
        prisma.student.count({
          where: { classId: context.classId, status: "ACTIVE", gender: "FEMALE" },
        }),
        prisma.timetableEntry.findMany({
          where: { classId: context.classId, weekday },
          include: { course: true },
          orderBy: { period: "asc" },
        }),
        prisma.dutyGroup.findMany({
          where: { classId: context.classId, weekday },
          include: {
            assignments: {
              include: { student: { select: { id: true, name: true } } },
            },
          },
          orderBy: { sortOrder: "asc" },
        }),
        prisma.workItem.findMany({
          where: { classId: context.classId, status: { not: "DONE" } },
          orderBy: [{ priority: "desc" }, { dueAt: "asc" }],
          take: 6,
        }),
        prisma.exam.findMany({
          where: { classId: context.classId },
          orderBy: { examDate: "desc" },
          take: 3,
        }),
      ]);

    return {
      classInfo: {
        name: context.className,
        grade: context.grade,
        room: context.room,
        teacher: context.displayName,
      },
      summary: {
        studentCount,
        maleCount,
        femaleCount,
        todoCount: workItems.length,
      },
      today: { weekday, courses, dutyGroups },
      workItems,
      recentExams,
    };
  });
}
