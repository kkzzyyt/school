import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

export const guardianInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "请输入家长姓名").max(50),
  relationship: z.string().trim().min(1, "请输入与学生关系").max(30),
  phone: z
    .string()
    .trim()
    .regex(/^1\d{10}$/, "请输入 11 位手机号"),
  wechat: optionalText(80),
  workplace: optionalText(120),
  isPrimary: z.boolean().default(false),
});

export const createStudentSchema = z.object({
  studentNo: z.string().trim().min(1, "请输入学号").max(30),
  name: z.string().trim().min(1, "请输入姓名").max(50),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  birthDate: z.iso.date().optional().nullable(),
  phone: optionalText(30),
  address: optionalText(255),
  dormitory: optionalText(50),
  status: z
    .enum(["ACTIVE", "SUSPENDED", "TRANSFERRED", "GRADUATED"])
    .default("ACTIVE"),
  notes: optionalText(500),
  guardians: z.array(guardianInputSchema).max(5).default([]),
});

export const updateStudentSchema = createStudentSchema.partial();

export function ensureSinglePrimaryGuardian(
  guardians: Array<{ isPrimary?: boolean }>,
) {
  if (guardians.filter((guardian) => guardian.isPrimary).length > 1) {
    throw new z.ZodError([
      {
        code: "custom",
        path: ["guardians"],
        message: "每名学生只能设置一个主联系人",
      },
    ]);
  }
}
