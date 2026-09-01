import { handleApi, notFound } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { teacherProfilePatchSchema } from "@/server/validation/teacher";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const teacher = await prisma.teacher.findFirst({
      where: { id, classId: context.classId },
    });
    if (!teacher) notFound("任课教师不存在");
    return teacher;
  });
}

export async function PATCH(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const requestBody: unknown = await request.json();
    const input = teacherProfilePatchSchema.parse(requestBody);
    const body =
      typeof requestBody === "object" && requestBody !== null
        ? requestBody as Record<string, unknown>
        : {};
    const hasField = (field: string) => Object.prototype.hasOwnProperty.call(body, field);
    const existing = await prisma.teacher.findFirst({
      where: { id, classId: context.classId },
      select: { id: true, name: true },
    });
    if (!existing) notFound("任课教师不存在");

    return prisma.$transaction(async (transaction) => {
      const teacher = await transaction.teacher.update({
        where: { id },
        data: {
          ...(hasField("name") && input.name !== undefined ? { name: input.name } : {}),
          ...(hasField("title") ? { title: input.title ?? null } : {}),
          ...(hasField("phone") ? { phone: input.phone ?? null } : {}),
          ...(hasField("email") ? { email: input.email ?? null } : {}),
          ...(hasField("notes") ? { notes: input.notes ?? null } : {}),
          ...(hasField("status") && input.status !== undefined ? { status: input.status } : {}),
          ...(hasField("sortOrder") && input.sortOrder !== undefined
            ? { sortOrder: input.sortOrder }
            : {}),
        },
      });
      if (input.name !== undefined && input.name !== existing.name) {
        await transaction.timetableEntry.updateMany({
          where: { classId: context.classId, teacherId: id },
          data: { teacherName: input.name },
        });
      }
      return teacher;
    });
  });
}

export async function DELETE(request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const { id } = await routeContext.params;
    const deleted = await prisma.teacher.deleteMany({
      where: { id, classId: context.classId },
    });
    if (deleted.count === 0) notFound("任课教师不存在");
    return null;
  });
}
