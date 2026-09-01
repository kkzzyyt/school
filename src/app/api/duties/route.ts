import { handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { assertStudentsBelongToClass } from "@/server/services/class-access";
import { dutyInputSchema } from "@/server/validation/duty";

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const [groups, students] = await Promise.all([
      prisma.dutyGroup.findMany({
        where: { classId: context.classId },
        include: {
          assignments: {
            include: { student: { select: { id: true, name: true, studentNo: true } } },
          },
        },
        orderBy: [{ weekday: "asc" }, { sortOrder: "asc" }],
      }),
      prisma.student.findMany({
        where: { classId: context.classId, status: "ACTIVE" },
        select: { id: true, name: true, studentNo: true },
        orderBy: { studentNo: "asc" },
      }),
    ]);
    return { groups, students };
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = dutyInputSchema.parse(await request.json());
    await assertStudentsBelongToClass(input.studentIds, context.classId);

    return prisma.dutyGroup.create({
      data: {
        classId: context.classId,
        name: input.name,
        weekday: input.weekday,
        area: input.area,
        notes: input.notes,
        sortOrder: input.sortOrder,
        assignments: {
          create: [...new Set(input.studentIds)].map((studentId) => ({ studentId })),
        },
      },
      include: { assignments: { include: { student: true } } },
    });
  });
}
