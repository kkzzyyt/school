import { describe, expect, it } from "vitest";

import { ApiError } from "@/server/api/errors";

import { assertSameOrigin } from "./origin";

describe("assertSameOrigin", () => {
  it("accepts a browser mutation from the same origin", () => {
    const request = new Request("https://school.example/api/students", {
      method: "POST",
      headers: { origin: "https://school.example", host: "school.example" },
    });

    expect(() => assertSameOrigin(request, "production")).not.toThrow();
  });

  it("uses forwarded host and protocol behind a reverse proxy", () => {
    const request = new Request("http://127.0.0.1:3000/api/students", {
      method: "POST",
      headers: {
        origin: "https://school.example",
        host: "127.0.0.1:3000",
        "x-forwarded-host": "school.example",
        "x-forwarded-proto": "https",
      },
    });

    expect(() => assertSameOrigin(request, "production")).not.toThrow();
  });

  it("rejects cross-origin mutation requests", () => {
    const request = new Request("https://school.example/api/students", {
      method: "POST",
      headers: { origin: "https://attacker.example", host: "school.example" },
    });

    expect(() => assertSameOrigin(request, "production")).toThrowError(
      new ApiError(403, "FORBIDDEN", "请求来源不受信任"),
    );
  });

  it("allows non-browser requests without Origin only during development", () => {
    const request = new Request("http://localhost:3000/api/students", {
      method: "POST",
      headers: { host: "localhost:3000" },
    });

    expect(() => assertSameOrigin(request, "development")).not.toThrow();
    expect(() => assertSameOrigin(request, "production")).toThrow();
  });

  it("does not require an Origin for safe methods", () => {
    const request = new Request("https://school.example/api/students");

    expect(() => assertSameOrigin(request, "production")).not.toThrow();
  });
});
