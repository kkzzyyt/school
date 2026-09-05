"use client";

import { ArrowRightOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, App, Button, Checkbox, Form, Input } from "antd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";

interface LoginValues {
  username: string;
  password: string;
  remember?: boolean;
}

interface LoginResponse {
  displayName: string;
  userRole: "ADMIN" | "HEAD_TEACHER";
  hasClassMembership: boolean;
}

const REMEMBERED_ACCOUNT_KEY = "school.remembered-account";

export default function LoginPage() {
  const { message } = App.useApp();
  const router = useRouter();
  const [form] = Form.useForm<LoginValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const rememberedAccount = window.localStorage.getItem(REMEMBERED_ACCOUNT_KEY);
    if (rememberedAccount) {
      form.setFieldsValue({ username: rememberedAccount, remember: true });
    }
  }, [form]);

  async function handleLogin(values: LoginValues) {
    setLoading(true);
    setError(null);
    try {
      const loginResult = await apiRequest<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: values.username, password: values.password }),
        redirectOnUnauthorized: false,
      });
      if (values.remember) {
        window.localStorage.setItem(REMEMBERED_ACCOUNT_KEY, values.username);
      } else {
        window.localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
      }
      const destination = loginResult.userRole === "ADMIN" && !loginResult.hasClassMembership
        ? "/admin/users"
        : "/dashboard";
      router.replace(destination);
      router.refresh();
    } catch (loginError) {
      setError((loginError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      {/* Pear 原版高清动态循环视频 signal.mp4 (日光通透、绝无压暗) */}
      <video
        className="login-video-backdrop"
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
        poster="/films/signal-poster.jpg"
      >
        <source src="/films/signal.mp4" type="video/mp4" />
      </video>

      {/* 学术公报索引标头 (高对比深碳墨色) */}
      <header className="login-meta-header">
        <span>VOL. 2026 // PROSPECTUS</span>
        <span>PEAR ARCHIVAL CORE</span>
      </header>

      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="login-brand-strip">
            <div className="login-logo">缺</div>
            <span className="login-brand-meta">ARCHIVAL REGISTRY // SIS</span>
          </div>
          <h1 id="login-title">缺我不转工作台</h1>
          <p>没有我你们可怎么办啊！！</p>
        </div>

        {error && <Alert showIcon type="error" title={error} style={{ marginBottom: 20 }} />}

        <Form<LoginValues>
          form={form}
          layout="vertical"
          onFinish={handleLogin}
          requiredMark={false}
        >
          <Form.Item name="username" label="账号 / USERNAME" rules={[{ required: true, message: "请输入账号" }]}>
            <Input size="large" prefix={<UserOutlined />} placeholder="请输入系统登记账号" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码 / CREDENTIAL" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入通行密码" autoComplete="current-password" />
          </Form.Item>
          <div className="login-options">
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住凭据</Checkbox>
            </Form.Item>
            <Button type="link" onClick={() => void message.info("请联系管理员重置密码")}>忘记密码？</Button>
          </div>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} className="login-submit-btn">
            认证并登录 <ArrowRightOutlined />
          </Button>
          <div className="login-register-link">
            还没有学府教务账号？<Link href="/register">立即注册</Link>
          </div>
        </Form>
      </section>

      {/* 学术公报底部索引标注 */}
      <footer className="login-meta-footer">
        <span>FIG. 01 — CLASSICAL ARCHITECTURE &amp; SCULPTURE</span>
        <span>TERMS &amp; SECURITY PROTOCOL</span>
      </footer>
    </main>
  );
}
