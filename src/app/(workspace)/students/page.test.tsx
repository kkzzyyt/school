import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import StudentsPage from "./page";

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

  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/students",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/useApiData", () => ({
  useApiData: vi.fn().mockReturnValue({
    data: {
      items: [
        {
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
          guardians: [],
        },
      ],
      meta: { total: 1, page: 1, pageSize: 100 },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe("StudentsPage", () => {
  it("renders search bar and student without status filter segmented", () => {
    render(<StudentsPage />);

    // 1. Search bar is present
    const searchInput = screen.getByPlaceholderText("搜索姓名或学号");
    expect(searchInput).toBeInTheDocument();

    // 2. The right search button is present
    const searchBtn = document.querySelector(".ant-input-search-btn");
    expect(searchBtn).toBeInTheDocument();
    expect(searchBtn?.querySelector(".anticon-search")).toBeInTheDocument();

    // 3. Status filter is completely removed
    expect(screen.queryByText("学籍状态")).not.toBeInTheDocument();
    expect(screen.queryByText("全部")).not.toBeInTheDocument();

    // 4. Student card is rendered cleanly
    expect(screen.getByRole("heading", { level: 2, name: "陈小明" })).toBeInTheDocument();
    expect(screen.queryByText("在读")).not.toBeInTheDocument();
  });
});
