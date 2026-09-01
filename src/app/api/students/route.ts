import { z } from "zod";

import { handleApi } from "@/server/api/errors";
import { requireAuthContext } from "@/server/auth/context";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  createStudentSchema,
  ensureSinglePrimaryGuardian,
} from "@/server/validation/student";

const listStudentsSchema = z.object({
  q: z.string().trim().max(50).default(""),
  status: z
    .enum(["ACTIVE", "SUSPENDED", "TRANSFERRED", "GRADUATED"])
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  return handleApi(async () => {
    const context = await requireAuthContext();
    const url = new URL(request.url);
    const query = listStudentsSchema.parse(Object.fromEntries(url.searchParams));
    const where = {
      classId: context.classId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q } },
              { studentNo: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.student.findMany({
        where,
        include: {
          guardians: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] },
          seat: true,
          committees: { orderBy: { sortOrder: "asc" } },
        },
        orderBy: { studentNo: "asc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.student.count({ where }),
    ]);

    return { items, meta: { total, page: query.page, pageSize: query.pageSize } };
  });
}

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const context = await requireAuthContext();
    const input = createStudentSchema.parse(await request.json());
    ensureSinglePrimaryGuardian(input.guardians);

    return prisma.student.create({
      data: {
        classId: context.classId,
        studentNo: input.studentNo,
        name: input.name,
        gender: input.gender,
        birthDate: input.birthDate ? new Date(`${input.birthDate}T00:00:00.000Z`) : null,
        phone: input.phone,
        address: input.address,
        dormitory: input.dormitory,
        status: input.status,
        notes: input.notes,
        guardians: {
          create: input.guardians.map((guardian) => ({
            name: guardian.name,
            relationship: guardian.relationship,
            phone: guardian.phone,
            wechat: guardian.wechat,
            workplace: guardian.workplace,
            isPrimary: guardian.isPrimary,
          })),
        },
      },
      include: { guardians: true },
    });
  });
}
