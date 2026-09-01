import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: {
    student: {
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    guardian: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
  },
  prisma: {
    student: {
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthContext: mocks.requireAuthContext,
}));
vi.mock("@/server/auth/origin", () => ({
  assertSameOrigin: mocks.assertSameOrigin,
}));
vi.mock("@/server/db/prisma", () => ({ prisma: mocks.prisma }));

import { GET, POST } from "./route";
import { DELETE, PATCH } from "./[id]/route";

const authContext = {
  userId: "user-1",
  username: "teacher",
  displayName: "周老师",
  userRole: "HEAD_TEACHER" as const,
  classId: "class-1",
  className: "高二（3）班",
  grade: "高二",
  room: "致远楼 302",
};

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(`https://school.example${url}`, {
    method,
    headers: { "content-type": "application/json" },
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

const createPayload = {
  studentNo: " 2026001 ",
  name: " 陈晨 ",
  gender: "FEMALE",
  birthDate: "2009-03-18",
  phone: "13800000001",
  guardians: [
    {
      name: "陈先生",
      relationship: "父亲",
      phone: "13800000002",
      isPrimary: true,
    },
  ],
};

describe("student route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    mocks.prisma.student.create.mockResolvedValue({
      id: "student-1",
      studentNo: "2026001",
      name: "陈晨",
      guardians: [],
    });
    mocks.prisma.student.findMany.mockResolvedValue([]);
    mocks.prisma.student.count.mockResolvedValue(0);
    mocks.prisma.student.findFirst.mockResolvedValue({ id: "student-1" });
    mocks.prisma.student.update.mockResolvedValue({ id: "student-1", status: "TRANSFERRED" });
    mocks.prisma.student.delete.mockResolvedValue({ id: "student-1" });
    mocks.transaction.student.update.mockResolvedValue({ id: "student-1" });
    mocks.transaction.student.findUnique.mockResolvedValue({ id: "student-1", guardians: [] });
    mocks.transaction.guardian.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.guardian.createMany.mockResolvedValue({ count: 0 });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
  });

  it("creates a student in the authenticated class and normalizes input", async () => {
    const response = await POST(jsonRequest("/api/students", createPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mocks.prisma.student.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classId: "class-1",
        studentNo: "2026001",
        name: "陈晨",
        gender: "FEMALE",
        birthDate: new Date("2009-03-18T00:00:00.000Z"),
        guardians: {
          create: [
            expect.objectContaining({
              name: "陈先生",
              relationship: "父亲",
              phone: "13800000002",
              isPrimary: true,
            }),
          ],
        },
      }),
      include: { guardians: true },
    });
  });

  it("returns validation error and performs no write for multiple primary guardians", async () => {
    const response = await POST(
      jsonRequest("/api/students", {
        ...createPayload,
        guardians: [
          ...createPayload.guardians,
          { name: "陈女士", relationship: "母亲", phone: "13800000003", isPrimary: true },
        ],
      }),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "每名学生只能设置一个主联系人" },
    });
    expect(mocks.prisma.student.create).not.toHaveBeenCalled();
  });

  it("maps a duplicate class student number to a conflict response", async () => {
    mocks.prisma.student.create.mockRejectedValue({ code: "P2002" });

    const response = await POST(jsonRequest("/api/students", createPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body).toMatchObject({
      success: false,
      error: { code: "CONFLICT" },
    });
  });

  it("returns 401 for a missing session before reading student data", async () => {
    mocks.requireAuthContext.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录"),
    );

    const response = await GET(new Request("https://school.example/api/students"));
    const body = await responseBody(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({
      success: false,
      error: { code: "UNAUTHORIZED" },
    });
    expect(mocks.prisma.student.findMany).not.toHaveBeenCalled();
  });

  it("scopes roster search and pagination to the authenticated class", async () => {
    mocks.prisma.student.findMany.mockResolvedValue([{ id: "student-1", name: "陈晨" }]);
    mocks.prisma.student.count.mockResolvedValue(1);

    const response = await GET(
      new Request("https://school.example/api/students?q=%E9%99%88&page=2&pageSize=25"),
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      items: [{ id: "student-1", name: "陈晨" }],
      meta: { total: 1, page: 2, pageSize: 25 },
    });
    expect(mocks.prisma.student.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        classId: "class-1",
        OR: [
          { name: { contains: "陈" } },
          { studentNo: { contains: "陈" } },
        ],
      },
      skip: 25,
      take: 25,
    }));
    expect(mocks.prisma.student.count).toHaveBeenCalledWith({
      where: {
        classId: "class-1",
        OR: [
          { name: { contains: "陈" } },
          { studentNo: { contains: "陈" } },
        ],
      },
    });
  });

  it("updates student fields and replaces guardians in one transaction", async () => {
    const response = await PATCH(
      jsonRequest(
        "/api/students/student-1",
        {
          name: "陈晨（已更新）",
          guardians: [{ name: "陈先生", relationship: "父亲", phone: "13800000002", isPrimary: true }],
        },
        "PATCH",
      ),
      { params: Promise.resolve({ id: "student-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.student.findFirst).toHaveBeenCalledWith({
      where: { id: "student-1", classId: "class-1" },
      select: { id: true },
    });
    expect(mocks.transaction.student.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { name: "陈晨（已更新）", status: "ACTIVE" },
    });
    expect(mocks.transaction.guardian.deleteMany).toHaveBeenCalledWith({
      where: { studentId: "student-1" },
    });
    expect(mocks.transaction.guardian.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ studentId: "student-1", isPrimary: true })],
    });
  });

  it("keeps score history by transferring a student instead of deleting", async () => {
    mocks.prisma.student.findFirst.mockResolvedValue({
      id: "student-1",
      _count: { scores: 1 },
    });

    const response = await DELETE(
      jsonRequest("/api/students/student-1", {}, "DELETE"),
      { params: Promise.resolve({ id: "student-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.student.update).toHaveBeenCalledWith({
      where: { id: "student-1" },
      data: { status: "TRANSFERRED" },
    });
    expect(mocks.prisma.student.delete).not.toHaveBeenCalled();
  });

  it.todo("supports batch student import with validation, atomic rollback, and Idempotency-Key replay");
});
