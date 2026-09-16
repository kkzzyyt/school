import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import DashboardPage from "./page";

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

vi.mock("@/hooks/useApiData", () => ({
  useApiData: vi.fn().mockReturnValue({
    data: {
      classInfo: { name: "1班", grade: "高一", room: "101", teacher: "周老师" },
      summary: { studentCount: 42, maleCount: 22, femaleCount: 20, todoCount: 3 },
      today: {
        weekday: 3,
        courses: [
          {
            id: "c-1",
            period: 1,
            teacherName: "周老师",
            room: "101",
            course: { name: "语文", color: "#015186" },
          },
        ],
        dutyGroups: [],
      },
      workItems: [
        { id: "w-1", title: "交班费记录", priority: "HIGH", dueAt: null },
      ],
      recentExams: [],
    },
    loading: false,
    error: null,
  }),
}));

describe("DashboardPage", () => {
  it("renders greetings, KPIs, and mobile-friendly quick action navigation grid", () => {
    render(<DashboardPage />);

    // 1. Check title & KPIs
    expect(screen.getByText(/早上好，周老师/)).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();

    // 2. Check quick navigation items
    expect(screen.getByText("班级座次")).toBeInTheDocument();
    expect(screen.getByText("学生花名册")).toBeInTheDocument();
    expect(screen.getByText("家长通讯录")).toBeInTheDocument();
    expect(screen.getByText("班级课表")).toBeInTheDocument();
    expect(screen.getByText("班级值日")).toBeInTheDocument();
    expect(screen.getByText("成绩分析")).toBeInTheDocument();

    // 3. Verify link destinations
    const seatingLink = screen.getByRole("link", { name: /班级座次/ });
    expect(seatingLink).toHaveAttribute("href", "/seating");

    const studentsLink = screen.getByRole("link", { name: /学生花名册/ });
    expect(studentsLink).toHaveAttribute("href", "/students");

    const contactsLink = screen.getByRole("link", { name: /家长通讯录/ });
    expect(contactsLink).toHaveAttribute("href", "/contacts");
  });
});
