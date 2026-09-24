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
        { id: "student-2", name: "李四", studentNo: "102", gender: "FEMALE", status: "ACTIVE" },
      ],
      assignments: [
        { studentId: "student-1", row: 1, column: 1 },
        { studentId: "student-2", row: 1, column: 2 },
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
    expect(screen.getByText("李四")).toBeInTheDocument();
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

describe("Seating swap behavior", () => {
  it("correctly swaps two students' positions without overwriting either student", async () => {
    render(
      <App>
        <SeatingPage />
      </App>
    );

    // Enter editing mode
    const editBtn = screen.getByRole("button", { name: /编辑座次/ });
    fireEvent.click(editBtn);

    // Before swap: 张三 is at (1, 1), 李四 is at (1, 2)
    const zhangBtn = screen.getByRole("button", { name: /第 1 排 1 座，张三/ });
    const liBtn = screen.getByRole("button", { name: /第 1 排 2 座，李四/ });
    expect(zhangBtn).toBeInTheDocument();
    expect(liBtn).toBeInTheDocument();

    // Click 张三's seat cell to select student
    const zhangCell = zhangBtn.closest(".seat-cell")!;
    fireEvent.click(zhangCell);

    // Click 李四's seat button to trigger swap
    fireEvent.click(liBtn);

    // After swap: 张三 should be at (1, 2), 李四 should be at (1, 1)
    expect(screen.getByRole("button", { name: /第 1 排 2 座，张三/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /第 1 排 1 座，李四/ })).toBeInTheDocument();
  });

  it("correctly swaps two students via drag and drop", () => {
    render(
      <App>
        <SeatingPage />
      </App>
    );

    // Enter editing mode
    const editBtn = screen.getByRole("button", { name: /编辑座次/ });
    fireEvent.click(editBtn);

    // Drag 张三 (1, 1) and drop onto 李四's seat cell (1, 2)
    const zhangBtn = screen.getByRole("button", { name: /第 1 排 1 座，张三/ });
    const liBtn = screen.getByRole("button", { name: /第 1 排 2 座，李四/ });
    const liCell = liBtn.closest(".seat-cell")!;

    fireEvent.dragStart(zhangBtn, {
      dataTransfer: {
        setData: vi.fn(),
        effectAllowed: "move",
      },
    });

    fireEvent.drop(liCell, {
      dataTransfer: {
        getData: (type: string) => (type === "text/plain" ? "student-1" : ""),
      },
    });

    // Both students should be swapped and both remain present
    expect(screen.getByRole("button", { name: /第 1 排 2 座，张三/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /第 1 排 1 座，李四/ })).toBeInTheDocument();
  });
});
