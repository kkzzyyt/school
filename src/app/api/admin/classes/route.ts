import { handleApi } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  return handleApi(async () => {
    await requireAdmin();
    const classrooms = await prisma.classroom.findMany({
      orderBy: [{ academicYear: "desc" }, { name: "asc" }],
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

    return {
      classes: classrooms.map(({ students, ...classroom }) => ({
        ...classroom,
        studentCount: students.length,
        students,
      })),
    };
  });
}
