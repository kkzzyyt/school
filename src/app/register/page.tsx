"use client";

import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  LockOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Alert, Button, Form, Input } from "antd";
import Link from "next/link";
import { useState } from "react";

import { apiRequest } from "@/lib/api";

interface RegistrationValues {
  username: string;
  displayName: string;
  password: string;
  confirmPassword: string;
}

export default function RegisterPage() {
  const [form] = Form.useForm<RegistrationValues>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  async function handleRegister(values: RegistrationValues) {
    setLoading(true);
    setError(null);
    try {
      await apiRequest<{ status: "PENDING" }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
        redirectOnUnauthorized: false,
      });
      setSubmitted(true);
      form.resetFields();
    } catch (registrationError) {
      setError((registrationError as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-page">
      {/* Pear 原版高清动态循环视频 signal.mp4 (日光通透背景) */}
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

      {/* 学术公报索引标头 */}
      <header className="login-meta-header">
        <span>VOL. 2026 // ADMISSION</span>
        <span>PEAR ARCHIVAL CORE</span>
      </header>

      <section className="login-panel register-panel" aria-labelledby="register-title">
        <div className="login-brand">
          <div className="login-brand-strip">
            <div className="login-logo">缺</div>
            <span className="login-brand-meta">ADMISSION &amp; ROSTER</span>
          </div>
          <h1 id="register-title">申请学籍注册</h1>
          <p>提交后由教务管理员审核并分配所属班级</p>
        </div>

        {submitted ? (
          <div className="register-success" role="status">
            <CheckCircleOutlined className="register-success-icon" />
            <h2>申请已提交</h2>
            <p>教务处审核通过并分配班级后，你即可使用该凭据登录教务系统。</p>
            <Link href="/login">
              <Button type="primary" size="large" block className="login-submit-btn">
                返回登录系统 <ArrowRightOutlined />
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {error && <Alert showIcon type="error" title={error} style={{ marginBottom: 20 }} />}
            <Form<RegistrationValues>
              form={form}
              layout="vertical"
              onFinish={handleRegister}
              requiredMark={false}
            >
              <Form.Item
                name="username"
                label="登记账号"
                extra="3-50 位字母、数字、点、短横线或下划线"
                rules={[{ required: true, message: "请输入账号" }]}
              >
                <Input size="large" prefix={<UserOutlined />} placeholder="请输入登录账号" autoComplete="username" />
              </Form.Item>
              <Form.Item
                name="displayName"
                label="真实姓名"
                rules={[{ required: true, message: "请输入姓名" }]}
              >
                <Input size="large" prefix={<UserOutlined />} placeholder="请输入真实姓名" autoComplete="name" />
              </Form.Item>
              <Form.Item
                name="password"
                label="通行密码"
                extra="至少 8 位，同时包含字母和数字"
                rules={[{ required: true, message: "请输入密码" }]}
              >
                <Input.Password size="large" prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="new-password" />
              </Form.Item>
              <Form.Item
                name="confirmPassword"
                label="再次确认密码"
                dependencies={["password"]}
                rules={[
                  { required: true, message: "请再次输入密码" },
                  ({ getFieldValue }) => ({
                    validator(_, value: string) {
                      if (!value || getFieldValue("password") === value) return Promise.resolve();
                      return Promise.reject(new Error("两次输入的密码不一致"));
                    },
                  }),
                ]}
              >
                <Input.Password size="large" prefix={<LockOutlined />} placeholder="请再次输入密码" autoComplete="new-password" />
              </Form.Item>
              <Button type="primary" htmlType="submit" size="large" block loading={loading} className="login-submit-btn">
                提交学籍申请 <ArrowRightOutlined />
              </Button>
            </Form>
            <div className="login-register-link">
              已有学府教务账号？<Link href="/login"><ArrowLeftOutlined /> 返回登录</Link>
            </div>
          </>
        )}
      </section>

      {/* 学术公报底部索引标注 */}
      <footer className="login-meta-footer">
        <span>REG. 2026 // ACADEMIC DOSSIER</span>
        <span>SECURITY &amp; ETHICS PROTOCOL</span>
      </footer>
    </main>
  );
}
