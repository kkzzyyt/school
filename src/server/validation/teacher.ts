import { z } from "zod";

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

export const teacherStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);
const teacherDirectoryStatusSchema = z
  .enum(["ACTIVE", "INACTIVE", "active", "inactive"])
  .transform((status) => status.toUpperCase() as "ACTIVE" | "INACTIVE");

const teacherFieldsSchema = z.object({
  name: z.string().trim().min(1, "请输入教师姓名").max(50),
  phone: optionalText(30),
  email: optionalText(120),
  notes: optionalText(255),
  status: teacherStatusSchema,
  sortOrder: z.number().int().min(0).max(100000),
});

const teacherProfileFieldsSchema = teacherFieldsSchema.extend({
  title: optionalText(80),
});

export const teacherInputSchema = teacherFieldsSchema.extend({
  status: teacherStatusSchema.default("ACTIVE"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

export const teacherPatchSchema = teacherFieldsSchema.partial();

export const teacherProfileInputSchema = teacherProfileFieldsSchema.extend({
  status: teacherStatusSchema.default("ACTIVE"),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});

export const teacherProfilePatchSchema = teacherProfileFieldsSchema.partial();

export const teacherDirectorySchema = z.object({
  items: z.array(
    z.object({
      id: z.string().min(1).optional(),
      name: z.string().trim().min(1, "请输入教师姓名").max(50),
      title: optionalText(80),
      phone: optionalText(30),
      email: optionalText(120),
      status: teacherDirectoryStatusSchema.optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    }),
  ).max(1000),
});
