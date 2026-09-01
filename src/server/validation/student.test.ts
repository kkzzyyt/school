import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  createStudentSchema,
  ensureSinglePrimaryGuardian,
} from "./student";

describe("createStudentSchema", () => {
  it("trims identifiers and names and applies safe defaults", () => {
    expect(
      createStudentSchema.parse({
        studentNo: " 2026001 ",
        name: " 陈晨 ",
        gender: "FEMALE",
      }),
    ).toEqual({
      studentNo: "2026001",
      name: "陈晨",
      gender: "FEMALE",
      status: "ACTIVE",
      guardians: [],
    });
  });

  it("accepts a valid student and guardian payload", () => {
    const result = createStudentSchema.parse({
      studentNo: "2026002",
      name: "林溪",
      gender: "FEMALE",
      birthDate: "2009-03-18",
      phone: "13800000001",
      guardians: [
        {
          name: "林先生",
          relationship: "父亲",
          phone: "13800000002",
          isPrimary: true,
        },
      ],
    });

    expect(result.birthDate).toBe("2009-03-18");
    expect(result.guardians).toHaveLength(1);
    expect(result.guardians[0]).toMatchObject({
      name: "林先生",
      relationship: "父亲",
      phone: "13800000002",
      isPrimary: true,
    });
  });

  it.each([
    ["empty student number", { studentNo: "", name: "陈晨", gender: "MALE" }],
    ["invalid gender", { studentNo: "2026003", name: "陈晨", gender: "UNKNOWN" }],
    ["invalid date", { studentNo: "2026003", name: "陈晨", gender: "MALE", birthDate: "2009/03/18" }],
    ["invalid guardian phone", {
      studentNo: "2026003",
      name: "陈晨",
      gender: "MALE",
      guardians: [{ name: "陈先生", relationship: "父亲", phone: "123" }],
    }],
  ])("rejects %s", (_caseName, payload) => {
    expect(() => createStudentSchema.parse(payload)).toThrow(ZodError);
  });

  it("limits the number of guardians in one write", () => {
    const guardians = Array.from({ length: 6 }, (_, index) => ({
      name: `家长${index}`,
      relationship: "家长",
      phone: `1380000000${index}`,
    }));

    expect(() =>
      createStudentSchema.parse({
        studentNo: "2026004",
        name: "陈晨",
        gender: "MALE",
        guardians,
      }),
    ).toThrow(ZodError);
  });
});

describe("ensureSinglePrimaryGuardian", () => {
  it("allows zero or one primary guardian", () => {
    expect(() => ensureSinglePrimaryGuardian([])).not.toThrow();
    expect(() => ensureSinglePrimaryGuardian([{ isPrimary: true }])).not.toThrow();
  });

  it("rejects multiple primary guardians with a stable validation message", () => {
    expect(() =>
      ensureSinglePrimaryGuardian([{ isPrimary: true }, { isPrimary: true }]),
    ).toThrowError("每名学生只能设置一个主联系人");
  });
});
