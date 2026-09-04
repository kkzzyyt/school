import { describe, expect, it } from "vitest";

import {
  adminUserCreateSchema,
  adminUserPatchSchema,
  registrationSchema,
  resetPasswordSchema,
} from "./user";

describe("user validation", () => {
  it("normalizes a valid registration username", () => {
    const result = registrationSchema.parse({
      username: "  New.Teacher  ",
      displayName: "李老师",
      password: "Teacher123",
      confirmPassword: "Teacher123",
    });

    expect(result).toMatchObject({
      username: "new.teacher",
      displayName: "李老师",
    });
  });

  it("rejects weak passwords and mismatched confirmation", () => {
    expect(() => registrationSchema.parse({
      username: "teacher",
      displayName: "李老师",
      password: "short",
      confirmPassword: "short",
    })).toThrow("密码至少需要 8 位，并同时包含字母和数字");

    expect(() => resetPasswordSchema.parse({
      password: "Teacher123",
      confirmPassword: "Teacher124",
    })).toThrow("两次输入的密码不一致");
  });

  it("requires a class when an administrator creates any user", () => {
    expect(() => adminUserCreateSchema.parse({
      username: "teacher2",
      displayName: "王老师",
      role: "HEAD_TEACHER",
    })).toThrow("请选择默认班级");

    expect(() => adminUserCreateSchema.parse({
      username: "admin2",
      displayName: "管理员二号",
      role: "ADMIN",
    })).toThrow("请选择默认班级");

    expect(adminUserCreateSchema.parse({
      username: "admin2",
      displayName: "管理员二号",
      role: "ADMIN",
      classId: "class-1",
    })).toMatchObject({ role: "ADMIN", classId: "class-1" });
  });

  it("only allows active or disabled states in an administrator patch", () => {
    expect(() => adminUserPatchSchema.parse({ status: "PENDING" })).toThrow();
    expect(adminUserPatchSchema.parse({ status: "DISABLED" })).toEqual({ status: "DISABLED" });
  });
});
