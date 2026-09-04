import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";

import { AppProviders } from "@/components/providers/AppProviders";

import "./globals.css";

export const metadata: Metadata = {
  title: { default: "缺我不转工作台", template: "%s｜缺我不转工作台" },
  description: "面向高中班主任的一站式教学与班级管理系统",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 全局底层 1080p 60fps 循环艺术视频 (colossus.mp4) */}
        <video
          className="global-video-backdrop"
          autoPlay
          loop
          muted
          playsInline
        >
          <source src="/films/colossus.mp4" type="video/mp4" />
        </video>
        <div className="global-video-overlay" />
        <AntdRegistry>
          <AppProviders>{children}</AppProviders>
        </AntdRegistry>
      </body>
    </html>
  );
}
