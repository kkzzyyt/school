"use client";

import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

dayjs.locale("zh-cn");

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: "#0b57d0",
          colorInfo: "#0b57d0",
          colorSuccess: "#087f5b",
          colorWarning: "#d97706",
          colorError: "#c5221f",
          colorText: "#191c1e",
          colorTextSecondary: "#5f6368",
          colorBorder: "#d7dce5",
          colorBgLayout: "#f7f9fc",
          borderRadius: 8,
          borderRadiusLG: 8,
          fontFamily: '"Inter", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Button: { controlHeight: 40, fontWeight: 600, primaryShadow: "none" },
          Card: { headerFontSize: 16, paddingLG: 24 },
          Input: { controlHeight: 40 },
          Menu: { itemBorderRadius: 8, itemHeight: 44, itemMarginInline: 10 },
          Select: { controlHeight: 40 },
          Table: { headerBg: "#f1f3f6", headerColor: "#3f4757", rowHoverBg: "#f7faff" },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
