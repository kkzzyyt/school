"use client";

import { ArrowRightOutlined, BookOutlined, LockOutlined, UserOutlined } from "@ant-design/icons";
import { Alert, App, Button, Checkbox, Form, Input } from "antd";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { apiRequest } from "@/lib/api";

interface LoginValues {
  username: string;
  password: string;
  remember?: boolean;
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
      await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: values.username, password: values.password }),
        redirectOnUnauthorized: false,
      });
      if (values.remember) {
        window.localStorage.setItem(REMEMBERED_ACCOUNT_KEY, values.username);
      } else {
        window.localStorage.removeItem(REMEMBERED_ACCOUNT_KEY);
      }
      router.replace("/dashboard");
      router.refresh();
    } catch (loginError) {
      setError((loginError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-panel" aria-labelledby="login-title">
        <div className="login-brand">
          <div className="login-logo"><BookOutlined /></div>
          <h1 id="login-title">智教办公系统</h1>
        </div>

        {error && <Alert showIcon type="error" title={error} style={{ marginBottom: 20 }} />}

        <Form<LoginValues>
          form={form}
          layout="vertical"
          onFinish={handleLogin}
          requiredMark={false}
        >
          <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
            <Input size="large" prefix={<UserOutlined />} placeholder="请输入账号" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
          </Form.Item>
          <div className="login-options">
            <Form.Item name="remember" valuePropName="checked" noStyle>
              <Checkbox>记住账号</Checkbox>
            </Form.Item>
            <Button type="link" onClick={() => void message.info("请联系管理员重置密码")}>忘记密码？</Button>
          </div>
          <Button type="primary" htmlType="submit" size="large" block loading={loading} style={{ height: 46 }}>
            立即登录 <ArrowRightOutlined />
          </Button>
        </Form>
      </section>
    </main>
  );
}
