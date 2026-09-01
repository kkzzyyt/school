import { z } from "zod";

import { validateSeatingLayout } from "@/domain/seating";
import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

const seatingSchema = z.object({
  rows: z.number().int(),
  columns: z.number().int(),
  assignments: z.array(
    z.object({
      studentId: z.string().min(1),
      row: z.number().int(),
      column: z.number().int(),
    }),
  ),
});

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const classroom = await prisma.classroom.findUnique({
      where: { id: context.classId },
      select: { seatRows: true, seatColumns: true },
    });
    const [students, assignments] = await Promise.all([
      prisma.student.findMany({
        where: { classId: context.classId, status: "ACTIVE" },
        select: { id: true, name: true, studentNo: true, gender: true },
        orderBy: { studentNo: "asc" },
      }),
      prisma.seatAssignment.findMany({
        where: { classId: context.classId },
        select: { studentId: true, row: true, column: true },
      }),
    ]);

    return {
      rows: classroom?.seatRows ?? 6,
      columns: classroom?.seatColumns ?? 8,
      students,
      assignments,
    };
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = seatingSchema.parse(await request.json());
    let layout;
    try {
      layout = validateSeatingLayout(input);
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "座位布局存在重复或越界位置");
    }

    const studentIds = [...new Set(layout.assignments.map((item) => item.studentId))];
    const ownedStudents = await prisma.student.count({
      where: { id: { in: studentIds }, classId: context.classId, status: "ACTIVE" },
    });
    if (ownedStudents !== studentIds.length) {
      throw new ApiError(403, "FORBIDDEN", "座次中包含无权访问的学生");
    }

    await prisma.$transaction(async (transaction) => {
      await transaction.classroom.update({
        where: { id: context.classId },
        data: { seatRows: layout.rows, seatColumns: layout.columns },
      });
      await transaction.seatAssignment.deleteMany({ where: { classId: context.classId } });
      if (layout.assignments.length > 0) {
        await transaction.seatAssignment.createMany({
          data: layout.assignments.map((assignment) => ({
            ...assignment,
            classId: context.classId,
          })),
        });
      }
    });

    return layout;
  });
}
