import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  PrismaClient: vi.fn(),
  PrismaMariaDb: vi.fn(),
}));

vi.mock("@prisma/adapter-mariadb", () => ({
  PrismaMariaDb: mocks.PrismaMariaDb,
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: mocks.PrismaClient,
}));

import { withDatabaseTimeouts } from "./prisma";

describe("withDatabaseTimeouts", () => {
  it("adds bounded MariaDB pool timeouts while preserving existing URL options", () => {
    const url = new URL(
      withDatabaseTimeouts("mysql://school:password@example.test:3306/school?ssl=true"),
    );

    expect(url.searchParams.get("ssl")).toBe("true");
    expect(url.searchParams.get("connectTimeout")).toBe("1000");
    expect(url.searchParams.get("acquireTimeout")).toBe("2000");
    expect(url.searchParams.get("queryTimeout")).toBe("2000");
  });

  it("respects explicitly configured MariaDB pool timeouts", () => {
    const url = new URL(
      withDatabaseTimeouts(
        "mysql://school:password@example.test/school?connectTimeout=4000&acquireTimeout=5000&queryTimeout=6000",
      ),
    );

    expect(url.searchParams.get("connectTimeout")).toBe("4000");
    expect(url.searchParams.get("acquireTimeout")).toBe("5000");
    expect(url.searchParams.get("queryTimeout")).toBe("6000");
  });

  it("leaves a malformed connection string unchanged for the adapter to report", () => {
    expect(withDatabaseTimeouts("not a database URL")).toBe("not a database URL");
  });
});
