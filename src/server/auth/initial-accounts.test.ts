import { describe, expect, it } from "vitest";

import {
  DEFAULT_INITIAL_PASSWORD,
  INITIAL_ACCOUNTS,
} from "./initial-accounts";

describe("initial accounts", () => {
  it("uses the built-in administrator and mx head-teacher accounts", () => {
    expect(DEFAULT_INITIAL_PASSWORD).toBe("123456");
    expect(INITIAL_ACCOUNTS).toEqual({
      administrator: {
        username: "admin",
        displayName: "系统管理员",
        role: "ADMIN",
      },
      headTeacher: {
        username: "mx",
        displayName: "周老师",
        role: "HEAD_TEACHER",
      },
    });
  });
});
