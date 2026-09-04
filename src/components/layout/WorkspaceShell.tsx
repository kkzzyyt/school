"use client";

import {
  AppstoreOutlined,
  ApartmentOutlined,
  BellOutlined,
  DownOutlined,
  IdcardOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuOutlined,
  MenuUnfoldOutlined,
  PhoneOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { App, Avatar, Button, Drawer, Dropdown, Layout, Menu, Tooltip } from "antd";
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
];

const adminMenuItems: NonNullable<MenuProps["items"]> = [
  { key: "/admin/users", icon: <SafetyCertificateOutlined />, label: "用户管理" },
  { key: "/admin/classes", icon: <ApartmentOutlined />, label: "班级管理" },
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
    items: [{ key: "logout", icon: <LogoutOutlined />, label: "退出登录", danger: true }],
    onClick: ({ key }) => key === "logout" && void logout(),
  };

  return (
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
          <div className="brand-mark-monogram">
            缺
          </div>
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
        <Content className="workspace-content">
          <div className="workspace-page-stack">{children}</div>
        </Content>
      </Layout>

      <Drawer
        className="mobile-navigation"
        placement="left"
        size={286}
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        closable={false}
        styles={{ body: { padding: 0 } }}
      >
        <div className="brand">
          <div className="brand-mark-monogram">缺</div>
          <div className="brand-copy">
            <div className="brand-title">缺我不转工作台</div>
            <div className="brand-subtitle">SIS / REG. 2026</div>
          </div>
        </div>
        {navigation}
        <div className="sider-footer">
          <Button type="text" icon={<LogoutOutlined />} onClick={() => void logout()}>退出登录</Button>
        </div>
      </Drawer>
    </Layout>
  );
}
