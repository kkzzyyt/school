import { render, screen, fireEvent, within } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "antd";

import SeatingPage from "./page";

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

vi.mock("@/hooks/useApiData", () => ({
  useApiData: vi.fn().mockReturnValue({
    data: {
      className: "高二（3）班",
      rows: 6,
      columns: 7,
      students: [
        { id: "student-1", name: "张三", studentNo: "101", gender: "MALE", status: "ACTIVE" },
      ],
      assignments: [
        { studentId: "student-1", row: 1, column: 1 },
      ],
      environment: {
        aisleAfterColumns: [2, 4],
        left: { windows: [], doorRows: [] },
        right: { windows: [], doorRows: [] },
        rear: {},
        lockedSeats: [],
        disabledSeats: [],
      },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

describe("SeatingPage Mobile Redesign", () => {
  it("renders mobile scroll hint for classroom seating chart", () => {
    render(
      <App>
        <SeatingPage />
      </App>
    );

    expect(screen.getByText(/左右滑动查看完整教室座位表/)).toBeInTheDocument();
    expect(screen.getByText("张三")).toBeInTheDocument();
  });

  it("renders mobile sticky action bar when entering editing mode", () => {
    render(
      <App>
        <SeatingPage />
      </App>
    );

    // Initial state: not editing, sticky bar shouldn't exist
    expect(screen.queryByRole("region", { name: "移动端座位编辑操作栏" })).not.toBeInTheDocument();

    // Click "编辑座次"
    const editBtn = screen.getByRole("button", { name: /编辑座次/ });
    fireEvent.click(editBtn);

    // Now mobile sticky bar appears with action buttons
    const stickyBar = screen.getByRole("region", { name: "移动端座位编辑操作栏" });
    expect(stickyBar).toBeInTheDocument();

    expect(within(stickyBar).getByRole("button", { name: "撤销" })).toBeInTheDocument();
    expect(within(stickyBar).getByRole("button", { name: "取消编辑" })).toBeInTheDocument();
    expect(within(stickyBar).getByRole("button", { name: "保存座次" })).toBeInTheDocument();
  });
});
