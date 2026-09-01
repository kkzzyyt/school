import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    session: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("argon2", () => ({ verify: mocks.verify }));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { POST } from "./route";

function loginRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://school.example/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "school.example",
      origin: "https://school.example",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function responseBody(response: Response) {
  return (await response.json()) as {
    success: boolean;
    data?: unknown;
    error?: { code: string; message: string };
  };
}

describe("POST /api/auth/login", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "teacher",
      displayName: "周老师",
      passwordHash: "$argon2id$v=19$m=65536,t=3,p=4$test",
      status: "ACTIVE",
    });
    mocks.prisma.session.create.mockResolvedValue({ id: "session-1" });
    mocks.prisma.user.update.mockResolvedValue({ id: "user-1" });
    mocks.prisma.$transaction.mockResolvedValue([]);
  });

  it("rejects malformed credentials before querying the database", async () => {
    const response = await POST(loginRequest({ username: "", password: "" }));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("uses one generic 401 response for wrong credentials", async () => {
    mocks.verify.mockResolvedValue(false);

    const response = await POST(loginRequest({ username: "teacher", password: "wrong" }));
    const body = await responseBody(response);

    expect(response.status).toBe(401);
    expect(body).toEqual({
      success: false,
      error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
    });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("does not allow a disabled account to create a session", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-1",
      username: "teacher",
      displayName: "周老师",
      passwordHash: "hash",
      status: "DISABLED",
    });

    const response = await POST(loginRequest({ username: "teacher", password: "secret" }));
    const body = await responseBody(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ error: { code: "INVALID_CREDENTIALS" } });
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("creates a hashed-token session and sets a protected cookie on success", async () => {
    const response = await POST(
      loginRequest({ username: " teacher ", password: "secret" }),
    );
    const body = await responseBody(response);
    const setCookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { displayName: "周老师" } });
    expect(mocks.verify).toHaveBeenCalledWith(
      "$argon2id$v=19$m=65536,t=3,p=4$test",
      "secret",
    );
    expect(mocks.prisma.session.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
      }),
    });
    expect(mocks.prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { lastLoginAt: expect.any(Date) },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledWith([
      expect.anything(),
      expect.anything(),
    ]);
    expect(setCookie).toContain("school_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=lax");
    expect(setCookie).toContain("Path=/");
  });

  it("rejects a cross-origin login mutation", async () => {
    const response = await POST(
      loginRequest(
        { username: "teacher", password: "secret" },
        { origin: "https://attacker.example" },
      ),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: { code: "FORBIDDEN", message: "请求来源不受信任" },
    });
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });
});
