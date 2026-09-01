import { ApiError, handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  teacherDirectorySchema,
  teacherProfileInputSchema,
} from "@/server/validation/teacher";

export async function GET() {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const teachers = await prisma.teacher.findMany({
      where: { classId: context.classId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return { teachers };
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = teacherProfileInputSchema.parse(await request.json());
    return prisma.teacher.create({
      data: {
        classId: context.classId,
        name: input.name,
        title: input.title,
        phone: input.phone,
        email: input.email,
        notes: input.notes,
        status: input.status,
        sortOrder: input.sortOrder,
      },
    });
  });
}

export async function PUT(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = teacherDirectorySchema.parse(await request.json());
    const names = input.items.map((item) => item.name);
    const ids = input.items
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));
    if (new Set(names).size !== names.length) {
      throw new ApiError(400, "VALIDATION_ERROR", "教师姓名不能重复");
    }
    if (new Set(ids).size !== ids.length) {
      throw new ApiError(400, "VALIDATION_ERROR", "教师 ID 不能重复");
    }

    const existing = await prisma.teacher.findMany({
      where: { classId: context.classId },
    });
    const existingById = new Map(existing.map((teacher) => [teacher.id, teacher]));
    const existingByName = new Map(existing.map((teacher) => [teacher.name, teacher]));

    const teachers = await prisma.$transaction(async (transaction) => {
      const saved: Array<(typeof existing)[number]> = [];
      for (const [index, item] of input.items.entries()) {
        const matched =
          (item.id ? existingById.get(item.id) : undefined) ??
          existingByName.get(item.name);
        const sameNameTeacher = existingByName.get(item.name);
        if (matched && sameNameTeacher && matched.id !== sameNameTeacher.id) {
          throw new ApiError(409, "CONFLICT", "教师姓名不能重复");
        }

        const data = {
          name: item.name,
          title: item.title !== undefined ? item.title : matched?.title ?? null,
          phone: item.phone !== undefined ? item.phone : matched?.phone ?? null,
          email: item.email !== undefined ? item.email : matched?.email ?? null,
          status: item.status ?? matched?.status ?? "ACTIVE",
          sortOrder: item.sortOrder ?? index,
        };
        const teacher = matched
          ? await transaction.teacher.update({ where: { id: matched.id }, data })
          : await transaction.teacher.create({
              data: { ...data, classId: context.classId },
            });
        if (matched && matched.name !== item.name) {
          await transaction.timetableEntry.updateMany({
            where: { classId: context.classId, teacherId: matched.id },
            data: { teacherName: item.name },
          });
        }
        saved.push(teacher);
      }

      const retainedIds = saved.map((teacher) => teacher.id);
      await transaction.teacher.deleteMany({
        where: {
          classId: context.classId,
          ...(retainedIds.length > 0 ? { id: { notIn: retainedIds } } : {}),
        },
      });
      return saved;
    });

    return { teachers };
  });
}
