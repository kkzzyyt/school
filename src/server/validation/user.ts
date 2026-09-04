import { z } from "zod";

const USERNAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const PASSWORD_HAS_LETTER = /[A-Za-z]/;
const PASSWORD_HAS_NUMBER = /\d/;

const passwordSchema = z
  .string()
  .min(8, "密码至少需要 8 位，并同时包含字母和数字")
  .max(200, "密码不能超过 200 位")
  .refine((value) => PASSWORD_HAS_LETTER.test(value) && PASSWORD_HAS_NUMBER.test(value), {
    message: "密码至少需要 8 位，并同时包含字母和数字",
  });

const displayNameSchema = z.string().trim().min(1, "请输入姓名").max(50, "姓名不能超过 50 个字符");

const usernameSchema = z
  .string()
  .trim()
  .min(3, "账号至少需要 3 个字符")
  .max(50, "账号不能超过 50 个字符")
  .regex(USERNAME_PATTERN, "账号只能包含字母、数字、点、短横线和下划线")
  .transform((value) => value.toLowerCase());

function withPasswordConfirmation<T extends z.ZodRawShape>(shape: T) {
  return z
    .object(shape)
    .superRefine((value, context) => {
      const credentials = value as { password?: unknown; confirmPassword?: unknown };
      if (credentials.password !== credentials.confirmPassword) {
        context.addIssue({
          code: "custom",
          path: ["confirmPassword"],
          message: "两次输入的密码不一致",
        });
      }
    });
}

export const registrationSchema = withPasswordConfirmation({
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
  confirmPassword: z.string().min(1, "请再次输入密码"),
});

export const resetPasswordSchema = withPasswordConfirmation({
  password: passwordSchema,
  confirmPassword: z.string().min(1, "请再次输入密码"),
});

export const adminUserCreateSchema = z.object({
    username: usernameSchema,
    displayName: displayNameSchema,
    role: z.enum(["ADMIN", "HEAD_TEACHER"]).default("HEAD_TEACHER"),
    classId: z.string({ error: "请选择默认班级" }).trim().min(1, "请选择默认班级"),
  });

export const adminUserPatchSchema = z
  .object({
    displayName: displayNameSchema.optional(),
    role: z.enum(["ADMIN", "HEAD_TEACHER"]).optional(),
    status: z.enum(["ACTIVE", "DISABLED"]).optional(),
    classId: z.string().trim().min(1, "请选择默认班级").nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "至少提供一项修改内容");

export const approveUserSchema = z.object({
  classId: z.string().trim().min(1, "请选择默认班级"),
});

export const adminUserQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["PENDING", "ACTIVE", "DISABLED"]).optional(),
  role: z.enum(["ADMIN", "HEAD_TEACHER"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AdminUserCreateInput = z.infer<typeof adminUserCreateSchema>;
export type AdminUserPatchInput = z.infer<typeof adminUserPatchSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;
