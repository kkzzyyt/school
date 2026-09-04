"use client";

import {
  AppstoreOutlined,
  BellOutlined,
  BookOutlined,
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
    ? adminMenuItems
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
          <div className="brand-mark"><BookOutlined /></div>
          {!collapsed && (
            <div className="brand-copy">
              <div className="brand-title">智教办公系统</div>
              <div className="brand-subtitle">效能版</div>
            </div>
          )}
        </div>
        {navigation}
        <div className="sider-footer">
          <Button type="text" icon={<LogoutOutlined />} onClick={() => void logout()}>
            {!collapsed && "退出登录"}
          </Button>
        </div>
      </Sider>

      <Layout className="workspace-main" style={{ marginLeft: siderWidth }}>
        <header className="workspace-header">
          <div className="header-leading">
            <Button
              className="mobile-menu-button"
              type="text"
              aria-label="打开导航菜单"
              icon={<MenuOutlined />}
              onClick={() => setMobileMenuOpen(true)}
            />
            <Button
              className="collapse-button"
              type="text"
              aria-label={collapsed ? "展开侧边栏" : "收起侧边栏"}
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed((value) => !value)}
            />
          </div>

          <div className="header-actions">
            <Tooltip title="通知">
              <Button type="text" aria-label="通知" icon={<BellOutlined />} onClick={() => void message.info("暂无新通知")} />
            </Tooltip>
            <Tooltip title="帮助">
              <Button type="text" aria-label="帮助" icon={<QuestionCircleOutlined />} onClick={() => void message.info("帮助中心正在完善中")} />
            </Tooltip>
            <Tooltip title="设置">
              <Button type="text" aria-label="设置" icon={<SettingOutlined />} onClick={() => void message.info("当前没有可调整的个人设置")} />
            </Tooltip>
            <Dropdown trigger={["click"]} menu={accountMenu}>
              <Button className="account-button" type="text" aria-label={`${auth.displayName}，账户菜单`}>
                <Avatar className="account-avatar">{auth.displayName.slice(0, 1)}</Avatar>
                <span className="account-name">{auth.displayName}</span>
                <DownOutlined className="account-chevron" />
              </Button>
            </Dropdown>
          </div>
        </header>
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
          <div className="brand-mark"><BookOutlined /></div>
          <div className="brand-copy">
            <div className="brand-title">智教办公系统</div>
            <div className="brand-subtitle">效能版</div>
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
