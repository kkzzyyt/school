import { handleApi, notFound } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { prisma } from "@/server/db/prisma";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, routeContext: RouteContext) {
  return handleApi(async () => {
    await requireAdmin();
    const { id } = await routeContext.params;
    const classroom = await prisma.classroom.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        grade: true,
        academicYear: true,
        semester: true,
        room: true,
        students: {
          orderBy: [{ status: "asc" }, { studentNo: "asc" }],
          select: {
            id: true,
            studentNo: true,
            name: true,
            gender: true,
            status: true,
          },
        },
      },
    });
    if (!classroom) notFound("班级不存在");

    const { students, ...classroomSummary } = classroom;
    return {
      classroom: { ...classroomSummary, studentCount: students.length },
      students,
    };
  });
}
