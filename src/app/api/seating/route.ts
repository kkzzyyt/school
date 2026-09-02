import { z } from "zod";

import { Prisma } from "@/generated/prisma/client";
import {
  DEFAULT_SEATING_SIDE_MARKER_ROWS,
  MAX_DOORS_PER_SIDE,
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ROWS,
  createDefaultSeatingEnvironment,
  type SeatingEnvironment,
  type SeatingEnvironmentInput,
  validateSeatingEnvironment,
  validateSeatingLayout,
} from "@/domain/seating";
import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";

const legacyDefaultAisleColumns = [3, 8] as const;

const sideLayoutSchema = z.object({
  windows: z.array(z.number().int()),
  doorRows: z.array(z.number().int()).optional(),
  // Read legacy records and older client payloads, then normalize them in the domain layer.
  doorRow: z.number().int().nullable().optional(),
});

const fixedFacilityPlacementSchema = z.object({
  side: z.enum(["LEFT", "RIGHT", "FRONT", "BACK"]),
  position: z.number().int(),
});

const seatingSchema = z.object({
  revision: z.string().datetime(),
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
    left: sideLayoutSchema,
    right: sideLayoutSchema,
    aisleAfterColumns: z.array(z.number().int()).optional(),
    // Legacy occupied-grid aisle values are normalized to insertion boundaries.
    aisleColumns: z.array(z.number().int()).optional(),
    rear: z.object({
      waterDispenser: z.enum(["LEFT", "CENTER", "RIGHT"]).nullable().optional(),
      airConditioner: z.enum(["LEFT", "CENTER", "RIGHT"]).nullable().optional(),
    }).optional(),
    fixedFacilities: z.object({
      waterDispenser: fixedFacilityPlacementSchema.nullable().optional(),
      airConditioner: fixedFacilityPlacementSchema.nullable().optional(),
    }).optional(),
  }).optional(),
});

function parseStoredEnvironment(
  value: unknown,
  rows: number,
  columns: number,
  legacyAisleColumns: readonly number[] = [],
): SeatingEnvironment {
  const fallbackEnvironment = () => {
    if (!legacyAisleColumns.length) return createDefaultSeatingEnvironment(columns);
    return validateSeatingEnvironment({
      aisleColumns: [...legacyAisleColumns],
      left: { windows: [], doorRows: [] },
      right: { windows: [], doorRows: [] },
      rear: { waterDispenser: null, airConditioner: null },
    }, rows, columns, { allowLegacySideRows: true });
  };
  const parsed = seatingSchema.shape.environment.safeParse(value);
  if (!parsed.success || !parsed.data) return fallbackEnvironment();

  try {
    const environmentInput = (
      !parsed.data.aisleAfterColumns
      && !parsed.data.aisleColumns
      && legacyAisleColumns.length
    )
      ? { ...parsed.data, aisleColumns: [...legacyAisleColumns] }
      : parsed.data;
    return validateSeatingEnvironment(environmentInput, rows, columns, { allowLegacySideRows: true });
  } catch {
    return fallbackEnvironment();
  }
}

function getLegacyDefaultAisleColumns(storedColumns: number): number[] {
  if (!Number.isInteger(storedColumns) || storedColumns < 1) return [];
  if (storedColumns === 10) return [...legacyDefaultAisleColumns];
  if (storedColumns >= 8) {
    const firstAisle = Math.max(2, Math.round(storedColumns * 0.3));
    const secondAisle = Math.min(storedColumns - 1, Math.round(storedColumns * 0.8));
    return firstAisle === secondAisle ? [firstAisle] : [firstAisle, secondAisle];
  }
  return storedColumns >= 5 ? [Math.ceil(storedColumns / 2)] : [];
}

function getLegacyAisleColumns(
  value: unknown,
  storedColumns: number,
  assignments: readonly { column: number }[] = [],
): number[] {
  const parsed = seatingSchema.shape.environment.safeParse(value);
  if (parsed.success && parsed.data?.aisleAfterColumns) {
    return [];
  }
  if (!parsed.success || !parsed.data) {
    if (storedColumns === DEFAULT_SEATING_COLUMNS && assignments.length === 0) {
      return [];
    }
    const inferredAisles = getLegacyDefaultAisleColumns(storedColumns);
    return inferredAisles.some((aisle) => assignments.some((assignment) => assignment.column === aisle))
      ? []
      : inferredAisles;
  }
  const aisleColumns = parsed.data.aisleColumns
    ? [...parsed.data.aisleColumns].sort((left, right) => left - right)
    : getLegacyDefaultAisleColumns(storedColumns);
  if (storedColumns === DEFAULT_SEATING_COLUMNS && !parsed.data.aisleColumns && assignments.length === 0) {
    return [];
  }
  if (
    new Set(aisleColumns).size !== aisleColumns.length
    || aisleColumns.some((column) => column < 2 || column >= storedColumns)
  ) {
    return [];
  }
  return aisleColumns;
}

function normalizeLegacyAssignments<T extends { column: number }>(
  assignments: T[],
  legacyAisleColumns: readonly number[],
): T[] {
  if (!legacyAisleColumns.length) return assignments;
  return assignments.map((assignment) => ({
    ...assignment,
    column: assignment.column - legacyAisleColumns.filter((aisle) => aisle < assignment.column).length,
  }));
}

function preserveLegacySideMarkers(
  environment: SeatingEnvironment,
  storedEnvironment: SeatingEnvironment,
): SeatingEnvironment {
  const mergeSide = (side: "left" | "right") => {
    const current = environment[side];
    const stored = storedEnvironment[side];
    const doorRows = [...new Set([
      ...current.doorRows,
      ...stored.doorRows.filter((row) => row > DEFAULT_SEATING_SIDE_MARKER_ROWS),
    ])].sort((left, right) => left - right);
    if (doorRows.length > MAX_DOORS_PER_SIDE) {
      throw new Error("legacy side door count exceeds the supported maximum");
    }
    return {
      windows: [...new Set([
        ...current.windows,
        ...stored.windows.filter((row) => row > DEFAULT_SEATING_SIDE_MARKER_ROWS),
      ])].sort((left, right) => left - right),
      doorRows,
    };
  };

  return {
    ...environment,
    left: mergeSide("left"),
    right: mergeSide("right"),
  };
}

function prepareEnvironmentForWrite(
  environment: SeatingEnvironmentInput,
  storedEnvironment: SeatingEnvironment,
): SeatingEnvironmentInput {
  const prepareSide = (
    side: SeatingEnvironmentInput["left"],
    storedSide: SeatingEnvironment["left"],
  ) => {
    const doorRows = side.doorRows
      ?? (side.doorRow === null || side.doorRow === undefined ? [] : [side.doorRow]);
    const legacyWindows = side.windows.filter((row) => row > DEFAULT_SEATING_SIDE_MARKER_ROWS);
    const legacyDoorRows = doorRows.filter((row) => row > DEFAULT_SEATING_SIDE_MARKER_ROWS);
    const storedLegacyWindows = new Set(
      storedSide.windows.filter((row) => row > DEFAULT_SEATING_SIDE_MARKER_ROWS),
    );
    const storedLegacyDoorRows = new Set(
      storedSide.doorRows.filter((row) => row > DEFAULT_SEATING_SIDE_MARKER_ROWS),
    );
    if (
      legacyWindows.some((row) => !storedLegacyWindows.has(row))
      || legacyDoorRows.some((row) => !storedLegacyDoorRows.has(row))
    ) {
      throw new Error("new markers cannot exceed the fixed side rail");
    }

    return {
      windows: side.windows.filter((row) => row <= DEFAULT_SEATING_SIDE_MARKER_ROWS),
      doorRows: doorRows.filter((row) => row <= DEFAULT_SEATING_SIDE_MARKER_ROWS),
    };
  };

  return {
    ...environment,
    left: prepareSide(environment.left, storedEnvironment.left),
    right: prepareSide(environment.right, storedEnvironment.right),
  };
}

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const classroom = await prisma.classroom.findUnique({
      where: { id: context.classId },
      select: { seatRows: true, seatColumns: true, seatingEnvironment: true, updatedAt: true },
    });
    const rows = classroom?.seatRows ?? DEFAULT_SEATING_ROWS;
    const storedColumns = classroom?.seatColumns ?? DEFAULT_SEATING_COLUMNS;
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
    const legacyAisleColumns = getLegacyAisleColumns(
      classroom?.seatingEnvironment,
      storedColumns,
      assignments,
    );
    const columns = legacyAisleColumns.length
      ? Math.max(1, storedColumns - legacyAisleColumns.length)
      : storedColumns;

    return {
      rows,
      columns,
      revision: classroom?.updatedAt ? classroom.updatedAt.toISOString() : null,
      students,
      assignments: normalizeLegacyAssignments(assignments, legacyAisleColumns),
      environment: parseStoredEnvironment(
        classroom?.seatingEnvironment,
        rows,
        storedColumns,
        legacyAisleColumns,
      ),
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
      select: { seatingEnvironment: true, seatColumns: true },
    });
    const storedColumns = classroom?.seatColumns ?? input.columns;
    const legacyAisleColumns = getLegacyAisleColumns(classroom?.seatingEnvironment, storedColumns);
    const storedEnvironment = parseStoredEnvironment(
      classroom?.seatingEnvironment,
      input.rows,
      storedColumns,
      legacyAisleColumns,
    );
    const environmentInput = input.environment
      ?? storedEnvironment;
    let layout;
    try {
      const normalizedEnvironment = preserveLegacySideMarkers(
        validateSeatingEnvironment(
          prepareEnvironmentForWrite(environmentInput, storedEnvironment),
          input.rows,
          input.columns,
        ),
        storedEnvironment,
      );
      const normalizedLayout = validateSeatingLayout(input);
      layout = {
        ...normalizedLayout,
        environment: normalizedEnvironment,
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
      const classroomUpdate = await transaction.classroom.updateMany({
        where: { id: context.classId, updatedAt: new Date(input.revision) },
        data: {
          seatRows: layout.rows,
          seatColumns: layout.columns,
          seatingEnvironment: layout.environment as unknown as Prisma.InputJsonValue,
        },
      });
      if (classroomUpdate.count !== 1) {
        throw new ApiError(409, "STALE_WRITE", "座次已被其他老师更新，请刷新后再试");
      }
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
