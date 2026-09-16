import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { StudentCard } from "./StudentCard";
import type { Student } from "./types";

const baseStudent: Student = {
  id: "student-1",
  studentNo: "1001",
  name: "陈小明",
  gender: "MALE",
  birthDate: null,
  phone: "13800138000",
  address: "上海市",
  dormitory: "302",
  status: "ACTIVE",
  notes: null,
  guardians: [
    {
      id: "guardian-1",
      name: "陈先生",
      relationship: "父亲",
      phone: "13900139000",
      wechat: null,
      workplace: null,
      isPrimary: true,
    },
  ],
};

describe("StudentCard", () => {
  it("does not render status tag when student status is ACTIVE", () => {
    render(
      <StudentCard
        student={baseStudent}
        onOpenDetail={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByRole("heading", { level: 2, name: "陈小明" })).toBeInTheDocument();
    expect(screen.queryByText("在读")).not.toBeInTheDocument();
    expect(screen.getByText("1001")).toBeInTheDocument();
    expect(screen.getByText(/宿舍 302/)).toBeInTheDocument();
    expect(screen.getByText("陈先生 · 父亲")).toBeInTheDocument();
  });

  it("renders status tag when student status is not ACTIVE (e.g. SUSPENDED)", () => {
    render(
      <StudentCard
        student={{ ...baseStudent, status: "SUSPENDED" }}
        onOpenDetail={vi.fn()}
        onEdit={vi.fn()}
      />
    );

    expect(screen.getByText("休学")).toBeInTheDocument();
  });
});
