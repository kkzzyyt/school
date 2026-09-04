import { handleApi } from "@/server/api/errors";
import { requireAdmin } from "@/server/auth/context";
import { prisma } from "@/server/db/prisma";

export async function GET() {
  return handleApi(async () => {
    await requireAdmin();
    const classrooms = await prisma.classroom.findMany({
      select: {
        id: true,
        name: true,
        grade: true,
        academicYear: true,
        semester: true,
      },
      orderBy: [{ academicYear: "desc" }, { name: "asc" }],
    });
    return { classrooms };
  });
}
