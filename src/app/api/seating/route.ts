import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ENVIRONMENT,
  DEFAULT_SEATING_ROWS,
  type SeatingEnvironment,
  validateSeatingEnvironment,
  validateSeatingLayout,
} from "@/domain/seating";
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
  environment: z.object({
    left: z.object({
      windows: z.array(z.number().int()),
      doorRow: z.number().int().nullable(),
    }),
    right: z.object({
      windows: z.array(z.number().int()),
      doorRow: z.number().int().nullable(),
    }),
  }).optional(),
});

function parseStoredEnvironment(value: unknown, rows: number): SeatingEnvironment {
  const parsed = seatingSchema.shape.environment.safeParse(value);
  if (!parsed.success || !parsed.data) return DEFAULT_SEATING_ENVIRONMENT;

  try {
    return validateSeatingEnvironment(parsed.data, rows);
  } catch {
    return DEFAULT_SEATING_ENVIRONMENT;
  }
}

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const classroom = await prisma.classroom.findUnique({
      where: { id: context.classId },
      select: { seatRows: true, seatColumns: true, seatingEnvironment: true },
    });
    const rows = classroom?.seatRows ?? DEFAULT_SEATING_ROWS;
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
      rows,
      columns: classroom?.seatColumns ?? DEFAULT_SEATING_COLUMNS,
      students,
      assignments,
      environment: parseStoredEnvironment(classroom?.seatingEnvironment, rows),
    };
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = seatingSchema.parse(await request.json());
    const classroom = await prisma.classroom.findUnique({
      where: { id: context.classId },
      select: { seatingEnvironment: true },
    });
    const environmentInput = input.environment
      ?? parseStoredEnvironment(classroom?.seatingEnvironment, input.rows);
    let layout;
    try {
      const normalizedLayout = validateSeatingLayout(input);
      layout = {
        ...normalizedLayout,
        environment: validateSeatingEnvironment(environmentInput, normalizedLayout.rows),
      };
    } catch {
      throw new ApiError(400, "VALIDATION_ERROR", "座位布局或教室标记存在重复、越界位置");
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
        data: {
          seatRows: layout.rows,
          seatColumns: layout.columns,
          seatingEnvironment: layout.environment as unknown as Prisma.InputJsonValue,
        },
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
