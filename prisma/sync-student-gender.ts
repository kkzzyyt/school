import "dotenv/config";

import { inferStudentGenderFromName } from "../src/domain/student-gender";
import { prisma } from "../src/server/db/prisma";

async function syncStudentGender() {
  const dryRun = process.argv.includes("--dry-run");
  const students = await prisma.student.findMany({
    where: { gender: "OTHER" },
    select: { id: true, studentNo: true, name: true },
    orderBy: { studentNo: "asc" },
  });
  const maleIds: string[] = [];
  const femaleIds: string[] = [];
  const unresolved: Array<{ studentNo: string; name: string }> = [];

  for (const student of students) {
    const inferredGender = inferStudentGenderFromName(student.name);
    if (inferredGender === "MALE") maleIds.push(student.id);
    else if (inferredGender === "FEMALE") femaleIds.push(student.id);
    else unresolved.push({ studentNo: student.studentNo, name: student.name });
  }

  if (!dryRun) {
    const updates = [
      maleIds.length > 0
        ? prisma.student.updateMany({
            where: { id: { in: maleIds }, gender: "OTHER" },
            data: { gender: "MALE" },
          })
        : null,
      femaleIds.length > 0
        ? prisma.student.updateMany({
            where: { id: { in: femaleIds }, gender: "OTHER" },
            data: { gender: "FEMALE" },
          })
        : null,
    ].filter((update): update is NonNullable<typeof update> => update !== null);
    if (updates.length > 0) await prisma.$transaction(updates);
  }

  console.info(JSON.stringify({
    dryRun,
    checked: students.length,
    male: maleIds.length,
    female: femaleIds.length,
    unresolved,
  }, null, 2));
}

syncStudentGender()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
