import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@/server/api/errors";

const mocks = vi.hoisted(() => ({
  assertSameOrigin: vi.fn(),
  requireAuthContext: vi.fn(),
  transaction: {
    teacher: {
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    timetableEntry: { updateMany: vi.fn() },
  },
  prisma: {
    teacher: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    timetableEntry: { updateMany: vi.fn() },
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

import { DELETE, GET as GET_BY_ID, PATCH } from "./[id]/route";
import { GET, POST, PUT } from "./route";

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

const existingTeacher = {
  id: "teacher-1",
  classId: "class-1",
  name: "王老师",
  title: "语文教师",
  phone: "13800000001",
  email: "wang@example.test",
  notes: null,
  status: "ACTIVE",
  sortOrder: 0,
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

describe("teacher route handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthContext.mockResolvedValue(authContext);
    mocks.prisma.teacher.findMany.mockResolvedValue([existingTeacher]);
    mocks.prisma.teacher.findFirst.mockResolvedValue(existingTeacher);
    mocks.prisma.teacher.create.mockResolvedValue({ ...existingTeacher, id: "teacher-2" });
    mocks.prisma.teacher.deleteMany.mockResolvedValue({ count: 1 });
    mocks.prisma.$transaction.mockImplementation(
      async (operation: (transaction: typeof mocks.transaction) => Promise<unknown>) =>
        operation(mocks.transaction),
    );
    mocks.transaction.teacher.update.mockResolvedValue({ ...existingTeacher, name: "张老师" });
    mocks.transaction.teacher.create.mockResolvedValue({ ...existingTeacher, id: "teacher-2", name: "李老师" });
    mocks.transaction.teacher.deleteMany.mockResolvedValue({ count: 0 });
    mocks.transaction.timetableEntry.updateMany.mockResolvedValue({ count: 2 });
  });

  it("lists only teachers belonging to the authenticated class", async () => {
    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { teachers: [existingTeacher] } });
    expect(mocks.prisma.teacher.findMany).toHaveBeenCalledWith({
      where: { classId: "class-1" },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
  });

  it("creates a teacher with class ownership derived from the session", async () => {
    const response = await POST(jsonRequest("/api/teachers", {
      name: " 李老师 ",
      title: "数学教师",
      phone: "13800000002",
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { id: "teacher-2" } });
    expect(mocks.prisma.teacher.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        classId: "class-1",
        name: "李老师",
        title: "数学教师",
        phone: "13800000002",
        status: "ACTIVE",
        sortOrder: 0,
      }),
    });
  });

  it("maps a unique teacher name conflict to 409", async () => {
    mocks.prisma.teacher.create.mockRejectedValue({ code: "P2002" });

    const response = await POST(jsonRequest("/api/teachers", { name: "王老师" }));
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, error: { code: "CONFLICT" } });
  });

  it("saves a directory atomically and propagates a renamed teacher to timetable rows", async () => {
    const response = await PUT(jsonRequest("/api/teachers", {
      items: [
        { id: "teacher-1", name: "张老师", title: "语文教师", sortOrder: 0 },
        { name: "李老师", title: "数学教师", sortOrder: 1 },
      ],
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, data: { teachers: expect.any(Array) } });
    expect(mocks.prisma.teacher.findMany).toHaveBeenCalledWith({
      where: { classId: "class-1" },
    });
    expect(mocks.transaction.teacher.update).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      data: expect.objectContaining({ name: "张老师", status: "ACTIVE", sortOrder: 0 }),
    });
    expect(mocks.transaction.teacher.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ classId: "class-1", name: "李老师", sortOrder: 1 }),
    });
    expect(mocks.transaction.timetableEntry.updateMany).toHaveBeenCalledWith({
      where: { classId: "class-1", teacherId: "teacher-1" },
      data: { teacherName: "张老师" },
    });
    expect(mocks.transaction.teacher.deleteMany).toHaveBeenCalledWith({
      where: { classId: "class-1", id: { notIn: ["teacher-1", "teacher-2"] } },
    });
  });

  it("rejects duplicate names in one directory write before opening a transaction", async () => {
    const response = await PUT(jsonRequest("/api/teachers", {
      items: [{ name: "王老师" }, { name: "王老师" }],
    }));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: { code: "VALIDATION_ERROR", message: "教师姓名不能重复" },
    });
    expect(mocks.prisma.teacher.findMany).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("patches a class-scoped teacher and synchronizes timetable names when renamed", async () => {
    const response = await PATCH(
      jsonRequest("/api/teachers/teacher-1", { name: "张老师", phone: null }, "PATCH"),
      { params: Promise.resolve({ id: "teacher-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.teacher.findFirst).toHaveBeenCalledWith({
      where: { id: "teacher-1", classId: "class-1" },
      select: { id: true, name: true },
    });
    expect(mocks.transaction.teacher.update).toHaveBeenCalledWith({
      where: { id: "teacher-1" },
      data: { name: "张老师", phone: null },
    });
    expect(mocks.transaction.timetableEntry.updateMany).toHaveBeenCalledWith({
      where: { classId: "class-1", teacherId: "teacher-1" },
      data: { teacherName: "张老师" },
    });
  });

  it("returns 404 for a teacher outside the authenticated class", async () => {
    mocks.prisma.teacher.findFirst.mockResolvedValue(null);

    const response = await GET_BY_ID(
      new Request("https://school.example/api/teachers/teacher-other"),
      { params: Promise.resolve({ id: "teacher-other" }) },
    );
    const body = await responseBody(response);

    expect(response.status).toBe(404);
    expect(body).toMatchObject({ success: false, error: { code: "NOT_FOUND" } });
  });

  it("deletes only the class-scoped teacher", async () => {
    const response = await DELETE(
      jsonRequest("/api/teachers/teacher-1", {}, "DELETE"),
      { params: Promise.resolve({ id: "teacher-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.teacher.deleteMany).toHaveBeenCalledWith({
      where: { id: "teacher-1", classId: "class-1" },
    });
  });

  it("returns 401 before querying teachers when the session is absent", async () => {
    mocks.requireAuthContext.mockRejectedValue(
      new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录"),
    );

    const response = await GET();
    const body = await responseBody(response);

    expect(response.status).toBe(401);
    expect(body).toMatchObject({ success: false, error: { code: "UNAUTHORIZED" } });
    expect(mocks.prisma.teacher.findMany).not.toHaveBeenCalled();
  });
});
