import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "antd";

import { WorkspaceShell } from "./WorkspaceShell";

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

afterEach(() => {
  cleanup();
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const mockTeacherAuth = {
  userId: "teacher-1",
  username: "teacher",
  displayName: "周老师",
  userRole: "HEAD_TEACHER" as const,
  classId: "class-1",
  className: "高一(1)班",
};

const mockAdminAuth = {
  userId: "admin-1",
  username: "admin",
  displayName: "李管理员",
  userRole: "ADMIN" as const,
};

describe("WorkspaceShell Mobile Responsive Navigation", () => {
  it("renders mobile header, bottom tabbar, and responds to mobile menu trigger", { timeout: 15000 }, () => {
    render(
      <App>
        <WorkspaceShell auth={mockTeacherAuth}>
          <div>页面主体内容</div>
        </WorkspaceShell>
      </App>
    );

    // 1. 验证移动端顶部导航栏存在并具有可访问性
    const mobileHeader = screen.getByRole("banner", { name: "移动端顶部导航" });
    expect(mobileHeader).toBeInTheDocument();
    const menuButtons = screen.getAllByLabelText("打开系统菜单");
    expect(menuButtons[0]).toBeInTheDocument();

    // 2. 验证移动端底部快捷导航栏包含 5 个核心入口
    const mobileTabbar = screen.getByRole("navigation", { name: "移动端快捷导航" });
    expect(mobileTabbar).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "工作台" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "座次" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "花名册" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "通讯录" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "更多功能导航" })).toBeInTheDocument();

    // 3. 点击顶部系统菜单按钮打开移动端抽屉
    fireEvent.click(menuButtons[0]);
    expect(screen.getByText("全部功能导航")).toBeInTheDocument();
    expect(screen.getAllByText("值日表").length).toBeGreaterThan(0);
    expect(screen.getAllByText("成绩分析").length).toBeGreaterThan(0);
    expect(screen.getAllByText("班委名单").length).toBeGreaterThan(0);
    expect(screen.getAllByText("课程表").length).toBeGreaterThan(0);

    // 4. 验证主体内容正常渲染
    expect(screen.getByText("页面主体内容")).toBeInTheDocument();
  });

  it("renders admin management links in drawer for admin role", { timeout: 15000 }, () => {
    render(
      <App>
        <WorkspaceShell auth={mockAdminAuth} mode="admin">
          <div>管理控制台内容</div>
        </WorkspaceShell>
      </App>
    );

    const menuButtons = screen.getAllByLabelText("打开系统菜单");
    fireEvent.click(menuButtons[0]);
    expect(screen.getAllByText("用户管理").length).toBeGreaterThan(0);
    expect(screen.getAllByText("班级管理").length).toBeGreaterThan(0);
  });
});
