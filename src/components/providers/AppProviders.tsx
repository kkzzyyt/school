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
          // Pear / Proof.io - Academic Ledger 经典北欧矿物印墨蓝主题
          colorPrimary: "#015186",
          colorInfo: "#015186",
          colorSuccess: "#2d5a43",
          colorWarning: "#8c6322",
          colorError: "#b93822",
          colorText: "#111110",
          colorTextSecondary: "#4a4843",
          colorBorder: "#ddd9ce",
          colorBgLayout: "transparent",
          colorBgContainer: "transparent",
          borderRadius: 4,
          borderRadiusLG: 6,
          borderRadiusSM: 2,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif',
        },
        components: {
          Button: {
            controlHeight: 38,
            fontWeight: 500,
            primaryShadow: "none",
            borderRadius: 4,
            defaultBorderColor: "#ddd9ce",
            defaultColor: "#111110",
            defaultBg: "#fbf9f5",
          },
          Card: {
            headerFontSize: 14,
            paddingLG: 24,
            borderRadiusLG: 4,
          },
          Input: {
            controlHeight: 38,
            borderRadius: 4,
            activeBorderColor: "#015186",
            hoverBorderColor: "#013d66",
          },
          Menu: {
            itemBorderRadius: 2,
            itemHeight: 42,
            itemMarginInline: 8,
            itemSelectedColor: "#015186",
            itemSelectedBg: "#e8f0f6",
          },
          Select: { controlHeight: 38, borderRadius: 4 },
          Table: {
            headerBg: "#f5f2eb",
            headerColor: "#4a4843",
            rowHoverBg: "#f5f2eb",
            borderRadius: 4,
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
