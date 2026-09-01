import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import { teacherInputSchema, teacherPatchSchema } from "./teacher";

describe("teacherInputSchema", () => {
  it("trims the name and applies active/sort defaults", () => {
    expect(teacherInputSchema.parse({ name: " 王老师 " })).toEqual({
      name: "王老师",
      phone: undefined,
      email: undefined,
      notes: undefined,
      status: "ACTIVE",
      sortOrder: 0,
    });
  });

  it("accepts teacher contact data and an inactive status", () => {
    expect(teacherInputSchema.parse({
      name: "李老师",
      phone: "13800000001",
      email: "li@example.test",
      notes: "数学备课组",
      status: "INACTIVE",
      sortOrder: 2,
    })).toMatchObject({
      name: "李老师",
      phone: "13800000001",
      email: "li@example.test",
      status: "INACTIVE",
      sortOrder: 2,
    });
  });

  it.each([
    ["empty name", { name: "" }],
    ["unknown status", { name: "王老师", status: "DISABLED" }],
    ["negative sort order", { name: "王老师", sortOrder: -1 }],
  ])("rejects %s", (_caseName, payload) => {
    expect(() => teacherInputSchema.parse(payload)).toThrow(ZodError);
  });
});

describe("teacherPatchSchema", () => {
  it("allows partial updates while retaining field validation", () => {
    expect(teacherPatchSchema.parse({ phone: "13800000002", status: "ACTIVE" })).toEqual({
      phone: "13800000002",
      status: "ACTIVE",
    });
    expect(() => teacherPatchSchema.parse({ sortOrder: -1 })).toThrow(ZodError);
  });
});
