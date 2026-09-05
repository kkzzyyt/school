import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  queryRaw: vi.fn(),
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    $queryRaw: mocks.queryRaw,
  },
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports healthy only after the database query succeeds", async () => {
    mocks.queryRaw.mockResolvedValue([{ value: 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { status: "ok" } });
    const [query] = mocks.queryRaw.mock.calls[0] ?? [];
    expect([...((query ?? []) as TemplateStringsArray)]).toEqual(["SELECT 1"]);
  });

  it("returns a generic 503 when the database is unavailable", async () => {
    mocks.queryRaw.mockRejectedValue(new Error("database unavailable"));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "服务暂时不可用" },
    });
  });

  it("returns a generic 503 when the database query exceeds the health deadline", async () => {
    vi.useFakeTimers();
    mocks.queryRaw.mockReturnValue(new Promise(() => undefined));

    const responsePromise = GET();
    expect(mocks.queryRaw).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5_000);
    const response = await responsePromise;
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      success: false,
      error: { code: "SERVICE_UNAVAILABLE", message: "服务暂时不可用" },
    });
  });
});
