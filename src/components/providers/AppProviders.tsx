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
          colorText: "#0a1b2a",
          colorTextSecondary: "#4f6e8a",
          colorBorder: "rgba(182, 211, 232, 0.6)",
          colorBgLayout: "transparent",
          colorBgContainer: "rgba(255, 255, 255, 0.88)",
          colorBgElevated: "rgba(255, 255, 255, 0.96)",
          borderRadius: 6,
          borderRadiusLG: 8,
          borderRadiusSM: 4,
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Segoe UI", sans-serif',
        },
        components: {
          Button: {
            controlHeight: 38,
            fontWeight: 500,
            primaryShadow: "none",
            borderRadius: 6,
            defaultBorderColor: "rgba(182, 211, 232, 0.6)",
            defaultColor: "#0a1b2a",
            defaultBg: "rgba(255, 255, 255, 0.8)",
          },
          Card: {
            headerFontSize: 14,
            paddingLG: 20,
            borderRadiusLG: 8,
            colorBgContainer: "rgba(255, 255, 255, 0.88)",
            colorBorderSecondary: "rgba(182, 211, 232, 0.6)",
          },
          Input: {
            controlHeight: 38,
            borderRadius: 6,
            colorBgContainer: "rgba(255, 255, 255, 0.9)",
            activeBorderColor: "#015186",
            hoverBorderColor: "#013b63",
          },
          Menu: {
            itemBorderRadius: 4,
            itemHeight: 42,
            itemMarginInline: 8,
            itemSelectedColor: "#015186",
            itemSelectedBg: "rgba(232, 242, 250, 0.8)",
          },
          Select: {
            controlHeight: 38,
            borderRadius: 6,
            colorBgContainer: "rgba(255, 255, 255, 0.9)",
            colorBgElevated: "#ffffff",
          },
          Segmented: {
            trackBg: "rgba(224, 238, 249, 0.85)",
            itemSelectedBg: "#ffffff",
            itemSelectedColor: "#015186",
            itemColor: "#274560",
            itemHoverBg: "rgba(255, 255, 255, 0.7)",
            itemHoverColor: "#0a1b2a",
            borderRadius: 6,
            borderRadiusSM: 4,
          },
          Modal: {
            headerBg: "#ffffff",
            contentBg: "#ffffff",
            footerBg: "#ffffff",
            titleColor: "#0a1b2a",
            borderRadiusLG: 10,
          },
          Table: {
            headerBg: "rgba(240, 246, 252, 0.85)",
            headerColor: "#0a1b2a",
            rowHoverBg: "rgba(232, 242, 250, 0.6)",
            colorBgContainer: "rgba(255, 255, 255, 0.88)",
            borderRadius: 6,
          },
          Tag: {
            borderRadiusSM: 4,
          },
        },
      }}
    >
      <App>{children}</App>
    </ConfigProvider>
  );
}
