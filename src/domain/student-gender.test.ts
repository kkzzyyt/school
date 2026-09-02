import { describe, expect, it } from "vitest";

import {
  inferStudentGenderFromName,
  resolveStudentGender,
} from "./student-gender";

describe("inferStudentGenderFromName", () => {
  it("infers common male and female name endings", () => {
    expect(inferStudentGenderFromName("蒋志豪")).toBe("MALE");
    expect(inferStudentGenderFromName("赵雅涵")).toBe("FEMALE");
  });

  it("matches additional common characters and weighs stronger hints", () => {
    expect(inferStudentGenderFromName("孙溪桥")).toBe("FEMALE");
    expect(inferStudentGenderFromName("沈泽熙")).toBe("MALE");
    expect(inferStudentGenderFromName("龚婉晨")).toBe("FEMALE");
    expect(inferStudentGenderFromName("李佳航")).toBe("MALE");
    expect(inferStudentGenderFromName("杨睿烁")).toBe("MALE");
  });

  it("trims names before inferring", () => {
    expect(inferStudentGenderFromName("  王晨  ")).toBe("MALE");
  });

  it("returns null for an ambiguous or empty name", () => {
    expect(inferStudentGenderFromName("未知同学")).toBeNull();
    expect(inferStudentGenderFromName(" ")).toBeNull();
    expect(inferStudentGenderFromName("明")).toBeNull();
  });
});

describe("resolveStudentGender", () => {
  it("keeps an explicitly entered male gender authoritative", () => {
    expect(resolveStudentGender("MALE", "赵雅涵")).toEqual({
      value: "MALE",
      label: "男",
      inferred: false,
    });
  });

  it("keeps explicitly entered gender authoritative", () => {
    expect(resolveStudentGender("FEMALE", "王伟")).toEqual({
      value: "FEMALE",
      label: "女",
      inferred: false,
    });
  });

  it("marks a name-based result without mutating the stored value", () => {
    expect(resolveStudentGender("OTHER", "蒋志豪")).toEqual({
      value: "MALE",
      label: "男",
      inferred: true,
    });
    expect(resolveStudentGender("OTHER", "赵雅涵")).toEqual({
      value: "FEMALE",
      label: "女",
      inferred: true,
    });
  });

  it("leaves unresolved names as other", () => {
    expect(resolveStudentGender("OTHER", "未知同学")).toEqual({
      value: "OTHER",
      label: "其他",
      inferred: false,
    });
  });
});
