"use client";

import {
  AppstoreOutlined,
  ApartmentOutlined,
  BarChartOutlined,
  CalendarOutlined,
  CloseOutlined,
  DownOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PhoneOutlined,
  ReadOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { App, Avatar, Button, Drawer, Dropdown, Layout, Menu } from "antd";
import type { MenuProps } from "antd";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

import type { AuthIdentity } from "@/server/auth/context";

const { Sider, Content } = Layout;

const workspaceMenuItems: NonNullable<MenuProps["items"]> = [
  { key: "/dashboard", icon: <AppstoreOutlined />, label: "工作台" },
  { key: "/seating", icon: <IdcardOutlined />, label: "座次表" },
  { key: "/students", icon: <TeamOutlined />, label: "花名册" },
  { key: "/contacts", icon: <PhoneOutlined />, label: "家长通讯录" },
  { key: "/duties", icon: <CalendarOutlined />, label: "值日表" },
  { key: "/grades", icon: <BarChartOutlined />, label: "成绩分析" },
  { key: "/committee", icon: <UserOutlined />, label: "班委名单" },
  { key: "/timetable", icon: <ReadOutlined />, label: "课程表" },
];

const adminMenuItems: NonNullable<MenuProps["items"]> = [
  { key: "/admin/users", icon: <SafetyCertificateOutlined />, label: "用户管理" },
  { key: "/admin/classes", icon: <ApartmentOutlined />, label: "班级管理" },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "工作台",
  "/seating": "座次表",
  "/students": "学生花名册",
  "/contacts": "家长通讯录",
  "/duties": "班级值日",
  "/grades": "成绩分析",
  "/committee": "班级架构",
  "/timetable": "班级课表",
  "/admin/users": "用户管理",
  "/admin/classes": "班级管理",
};

const mobileTabs = [
  { key: "/dashboard", icon: <AppstoreOutlined />, label: "工作台" },
  { key: "/seating", icon: <IdcardOutlined />, label: "座次" },
  { key: "/students", icon: <TeamOutlined />, label: "花名册" },
  { key: "/contacts", icon: <PhoneOutlined />, label: "通讯录" },
];

interface WorkspaceShellProps {
  auth: AuthIdentity;
  children: React.ReactNode;
  mode?: "workspace" | "admin";
}

export function WorkspaceShell({ auth, children, mode = "workspace" }: WorkspaceShellProps) {
  const { message } = App.useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const siderWidth = collapsed ? 80 : 248;
  const menuItems = mode === "admin"
    ? [...workspaceMenuItems, { type: "divider" as const }, ...adminMenuItems]
    : auth.userRole === "ADMIN"
      ? [...workspaceMenuItems, { type: "divider" as const }, ...adminMenuItems]
      : workspaceMenuItems;

  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      router.replace("/login");
      router.refresh();
    } catch {
      void message.error("退出失败，请稍后重试");
    }
  }

  function navigate(path: string) {
    router.push(path);
    setMobileMenuOpen(false);
  }

  const navigation = (
    <Menu
      className="workspace-menu"
      mode="inline"
      selectedKeys={[pathname]}
      items={menuItems}
      onClick={({ key }) => navigate(key)}
    />
  );

  const accountMenu: MenuProps = {
    items: [
      {
        key: "user-info",
        disabled: true,
        label: (
          <div style={{ padding: "4px 0" }}>
            <div style={{ fontWeight: 600, color: "var(--ink)" }}>{auth.displayName}</div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              {auth.userRole === "ADMIN" ? "教务管理员" : "班主任教师"}
            </div>
          </div>
        ),
      },
      { type: "divider" },
      ...(auth.userRole === "ADMIN"
        ? [
            {
              key: "/admin/users",
              icon: <SafetyCertificateOutlined />,
              label: "用户管理",
              onClick: () => navigate("/admin/users"),
            },
            {
              key: "/admin/classes",
              icon: <ApartmentOutlined />,
              label: "班级管理",
              onClick: () => navigate("/admin/classes"),
            },
            { type: "divider" as const },
          ]
        : []),
      { key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true },
    ],
    onClick: ({ key }) => {
      if (key === "logout") void logout();
      else if (key.startsWith("/")) navigate(key);
    },
  };

  return (
    <>
      {/* 工作台底层 1080p 60fps 循环艺术视频 (colossus.mp4) */}
      <video
        className="global-video-backdrop"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      >
        <source src="/films/colossus.mp4" type="video/mp4" />
      </video>
      <div className="global-video-overlay" />
      <Layout className="workspace-layout">
        <Sider
          className="workspace-sider"
          width={248}
          collapsedWidth={80}
          collapsed={collapsed}
          breakpoint="lg"
          onBreakpoint={setCollapsed}
          theme="light"
          trigger={null}
        >
          <div className="brand">
            <div className="brand-mark-monogram">缺</div>
            {!collapsed && (
              <div className="brand-copy">
                <div className="brand-title">缺我不转工作台</div>
                <div className="brand-subtitle">SIS / REG. 2026</div>
              </div>
            )}
            <Button
              className="sider-toggle-btn"
              type="text"
              size="small"
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
          </div>
          {navigation}
          <div className="sider-footer">
            <Dropdown trigger={["click"]} menu={accountMenu} placement="topRight">
              <div className="sider-user-profile" role="button" tabIndex={0}>
                <Avatar className="account-avatar">{auth.displayName.slice(0, 1)}</Avatar>
                {!collapsed && (
                  <div className="sider-user-info">
                    <div className="sider-user-name">{auth.displayName}</div>
                    <div className="sider-user-role">
                      {auth.userRole === "ADMIN" ? "教务管理员" : "班主任教师"}
                    </div>
                  </div>
                )}
              </div>
            </Dropdown>
          </div>
        </Sider>

        <Layout className="workspace-main" style={{ marginLeft: siderWidth }}>
          {/* 移动端专属吸顶导航栏 */}
          <header className="workspace-mobile-header" aria-label="移动端顶部导航">
            <div className="mobile-header-left">
              <Button
                className="mobile-menu-trigger"
                type="text"
                aria-label="打开系统菜单"
                icon={<MenuOutlined />}
                onClick={() => setMobileMenuOpen(true)}
              />
              <div className="mobile-header-brand" onClick={() => navigate("/dashboard")} role="button" tabIndex={0}>
                <span className="mobile-brand-mark">缺</span>
                <span className="mobile-header-title">{pageTitles[pathname] ?? "工作台"}</span>
              </div>
            </div>
            <div className="mobile-header-right">
              <Dropdown trigger={["click"]} menu={accountMenu} placement="bottomRight">
                <button
                  type="button"
                  className="mobile-user-avatar-btn"
                  aria-label={`${auth.displayName}，账户菜单`}
                >
                  <Avatar size={30} className="account-avatar">{auth.displayName.slice(0, 1)}</Avatar>
                </button>
              </Dropdown>
            </div>
          </header>

          <Content className="workspace-content">
            <div className="workspace-page-stack">{children}</div>
          </Content>

          {/* 移动端底部高频操作导航栏 */}
          <nav className="workspace-mobile-tabbar" aria-label="移动端快捷导航">
            {mobileTabs.map((tab) => {
              const isActive = pathname === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`mobile-tabbar-item ${isActive ? "active" : ""}`}
                  onClick={() => navigate(tab.key)}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={tab.label}
                >
                  <span className="mobile-tabbar-icon">{tab.icon}</span>
                  <span className="mobile-tabbar-label">{tab.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              className={`mobile-tabbar-item ${!mobileTabs.some((tab) => tab.key === pathname) ? "active-more" : ""}`}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="更多功能导航"
            >
              <span className="mobile-tabbar-icon"><MenuOutlined /></span>
              <span className="mobile-tabbar-label">更多</span>
            </button>
          </nav>
        </Layout>

        {/* 移动端全功能抽屉抽屉 */}
        <Drawer
          className="mobile-navigation"
          placement="left"
          size={300}
          open={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
          closable={false}
          styles={{ body: { padding: 0 } }}
        >
          <div className="mobile-drawer-header">
            <div className="brand">
              <div className="brand-mark-monogram">缺</div>
              <div className="brand-copy">
                <div className="brand-title">缺我不转工作台</div>
                <div className="brand-subtitle">SIS / REG. 2026</div>
              </div>
            </div>
            <Button
              type="text"
              className="mobile-drawer-close"
              icon={<CloseOutlined />}
              onClick={() => setMobileMenuOpen(false)}
              aria-label="关闭导航"
            />
          </div>

          <div className="mobile-drawer-user">
            <Avatar size={40} className="account-avatar">{auth.displayName.slice(0, 1)}</Avatar>
            <div className="mobile-drawer-user-info">
              <div className="mobile-drawer-user-name">{auth.displayName}</div>
              <div className="mobile-drawer-user-role">
                {auth.userRole === "ADMIN" ? "教务管理员" : "班主任教师"}
              </div>
            </div>
          </div>

          <div className="mobile-drawer-menu-wrap">
            <div className="mobile-menu-section-label">全部功能导航</div>
            {navigation}
          </div>

          <div className="sider-footer mobile-drawer-footer">
            <Button
              type="text"
              danger
              block
              icon={<LogoutOutlined />}
              onClick={() => void logout()}
            >
              退出登录
            </Button>
          </div>
        </Drawer>
      </Layout>
    </>
  );
}
