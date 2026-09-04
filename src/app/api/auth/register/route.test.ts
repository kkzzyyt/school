import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  hash: vi.fn(),
  userFindUnique: vi.fn(),
  userCreate: vi.fn(),
}));

vi.mock("argon2", () => ({ hash: mocks.hash }));
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      create: mocks.userCreate,
    },
  },
}));

import { POST } from "./route";

function registrationRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://school.example/api/auth/register", {
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

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("$argon2id$registration-hash");
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userCreate.mockResolvedValue({ id: "user-2" });
  });

  it("creates a pending head-teacher account without creating a session", async () => {
    const response = await POST(registrationRequest({
      username: " New.Teacher ",
      displayName: "李老师",
      password: "Teacher123",
      confirmPassword: "Teacher123",
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, data: { status: "PENDING" } });
    expect(mocks.hash).toHaveBeenCalledWith("Teacher123", { type: 2 });
    expect(mocks.userCreate).toHaveBeenCalledWith({
      data: {
        username: "new.teacher",
        displayName: "李老师",
        passwordHash: "$argon2id$registration-hash",
        role: "HEAD_TEACHER",
        status: "PENDING",
      },
    });
  });

  it("rejects malformed input before hashing or writing", async () => {
    const response = await POST(registrationRequest({
      username: "bad user",
      displayName: "",
      password: "short",
      confirmPassword: "short",
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ success: false, error: { code: "VALIDATION_ERROR" } });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("returns a conflict for an existing username", async () => {
    mocks.userFindUnique.mockResolvedValue({ id: "existing-user" });

    const response = await POST(registrationRequest({
      username: "teacher",
      displayName: "李老师",
      password: "Teacher123",
      confirmPassword: "Teacher123",
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, error: { code: "CONFLICT" } });
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin mutation", async () => {
    const response = await POST(
      registrationRequest(
        { username: "teacher", displayName: "李老师", password: "Teacher123", confirmPassword: "Teacher123" },
        { origin: "https://attacker.example" },
      ),
    );

    expect(response.status).toBe(403);
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });
});
