"use client";

import {
  CheckOutlined,
  KeyOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  StopOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from "antd";
import type { TableProps } from "antd";
import dayjs from "dayjs";
import { useMemo, useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

import styles from "./users.module.css";

type UserRole = "ADMIN" | "HEAD_TEACHER";
type UserStatus = "PENDING" | "ACTIVE" | "DISABLED";

interface AdminUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
  updatedAt: string;
  memberships: Array<{
    id: string;
    classId: string;
    role: "OWNER" | "TEACHER";
    isDefault: boolean;
    classroom: { id: string; name: string; grade: string; academicYear: string };
  }>;
}

interface UserListResponse {
  users: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}

interface ClassroomListResponse {
  classrooms: Array<{
    id: string;
    name: string;
    grade: string;
    academicYear: string;
    semester: "FIRST" | "SECOND";
  }>;
}

interface UserFormValues {
  username?: string;
  displayName: string;
  role: UserRole;
  status?: Exclude<UserStatus, "PENDING">;
  classId?: string;
}

interface UserManagementProps {
  currentUserId?: string;
}

const roleLabels: Record<UserRole, string> = {
  ADMIN: "系统管理员",
  HEAD_TEACHER: "班主任",
};

const statusLabels: Record<UserStatus, string> = {
  PENDING: "待审核",
  ACTIVE: "已启用",
  DISABLED: "已停用",
};

const statusColors: Record<UserStatus, string> = {
  PENDING: "orange",
  ACTIVE: "green",
  DISABLED: "default",
};

type EditorMode = "create" | "edit" | "approve";

export function UserManagement({ currentUserId }: UserManagementProps) {
  const { message, modal } = App.useApp();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "ALL">("ALL");
  const [editorMode, setEditorMode] = useState<EditorMode>("create");
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetSaving, setResetSaving] = useState(false);
  const [editorForm] = Form.useForm<UserFormValues>();
  const [resetForm] = Form.useForm<{ password: string; confirmPassword: string }>();

  const usersUrl = useMemo(() => {
    const params = new URLSearchParams({ page: "1", pageSize: "100" });
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (statusFilter !== "ALL") params.set("status", statusFilter);
    return `/api/admin/users?${params.toString()}`;
  }, [searchQuery, statusFilter]);
  const { data, loading, error, refresh } = useApiData<UserListResponse>(usersUrl);
  const { data: classroomsData, loading: classroomsLoading } = useApiData<ClassroomListResponse>("/api/admin/classrooms");
  const users = useMemo(() => data?.users ?? [], [data]);
  const classrooms = classroomsData?.classrooms ?? [];
  const summary = useMemo(() => ({
    total: data?.total ?? 0,
    pending: users.filter((user) => user.status === "PENDING").length,
    active: users.filter((user) => user.status === "ACTIVE").length,
    disabled: users.filter((user) => user.status === "DISABLED").length,
  }), [data?.total, users]);

  function closeEditor() {
    setEditorOpen(false);
    setEditingUser(null);
    editorForm.resetFields();
  }

  function openCreate() {
    setEditorMode("create");
    setEditingUser(null);
    editorForm.resetFields();
    editorForm.setFieldsValue({ role: "HEAD_TEACHER" });
    setEditorOpen(true);
  }

  function openEdit(user: AdminUser) {
    setEditorMode("edit");
    setEditingUser(user);
    editorForm.setFieldsValue({
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      status: user.status === "PENDING" ? "ACTIVE" : user.status,
      classId: user.memberships.find((membership) => membership.isDefault)?.classId
        ?? user.memberships[0]?.classId,
    });
    setEditorOpen(true);
  }

  function openApprove(user: AdminUser) {
    setEditorMode("approve");
    setEditingUser(user);
    editorForm.setFieldsValue({
      displayName: user.displayName,
      role: "HEAD_TEACHER",
      classId: user.memberships[0]?.classId,
    });
    setEditorOpen(true);
  }

  async function saveEditor() {
    setEditorSaving(true);
    try {
      const values = await editorForm.validateFields();
      if (editorMode === "create") {
        await apiRequest("/api/admin/users", {
          method: "POST",
          body: JSON.stringify({
            username: values.username,
            displayName: values.displayName,
            role: values.role,
            classId: values.classId,
          }),
        });
        message.success("用户已创建");
      } else if (editingUser && editorMode === "approve") {
        await apiRequest(`/api/admin/users/${editingUser.id}/approve`, {
          method: "POST",
          body: JSON.stringify({ classId: values.classId }),
        });
        message.success("注册申请已批准");
      } else if (editingUser) {
        await apiRequest(`/api/admin/users/${editingUser.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            displayName: values.displayName,
            role: values.role,
            status: values.status,
            classId: values.classId ?? null,
          }),
        });
        message.success("用户信息已保存");
      }
      closeEditor();
      await refresh();
    } catch (saveError) {
      if (saveError instanceof Error && saveError.message) {
        message.error(saveError.message);
      }
    } finally {
      setEditorSaving(false);
    }
  }

  function confirmStatusChange(user: AdminUser, status: Exclude<UserStatus, "PENDING">) {
    modal.confirm({
      title: status === "DISABLED" ? "停用这个用户？" : "启用这个用户？",
      content: status === "DISABLED" ? "停用后该用户的现有登录会话会立即失效。" : "启用后该用户可以重新登录系统。",
      okText: status === "DISABLED" ? "停用" : "启用",
      cancelText: "取消",
      okButtonProps: status === "DISABLED" ? { danger: true } : undefined,
      onOk: async () => {
        try {
          await apiRequest(`/api/admin/users/${user.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          });
          message.success(status === "DISABLED" ? "用户已停用" : "用户已启用");
          await refresh();
        } catch (statusError) {
          message.error((statusError as Error).message);
        }
      },
    });
  }

  function openResetPassword(user: AdminUser) {
    setResetUser(user);
    resetForm.resetFields();
    setResetOpen(true);
  }

  async function resetPassword() {
    if (!resetUser) return;
    setResetSaving(true);
    try {
      const values = await resetForm.validateFields();
      await apiRequest(`/api/admin/users/${resetUser.id}/reset-password`, {
        method: "POST",
        body: JSON.stringify(values),
      });
      message.success("密码已重置，旧会话已失效");
      setResetOpen(false);
      setResetUser(null);
      resetForm.resetFields();
    } catch (resetError) {
      if (resetError instanceof Error && resetError.message) message.error(resetError.message);
    } finally {
      setResetSaving(false);
    }
  }

  async function revokeSessions(user: AdminUser) {
    try {
      await apiRequest(`/api/admin/users/${user.id}/revoke-sessions`, { method: "POST" });
      message.success("该用户的登录会话已全部撤销");
    } catch (revokeError) {
      message.error((revokeError as Error).message);
    }
  }

  const columns: TableProps<AdminUser>["columns"] = [
    {
      title: "账号",
      dataIndex: "username",
      width: 180,
      render: (username: string, user) => (
        <Space>
          <AvatarInitial name={user.displayName} />
          <div>
            <strong>{username}</strong>
            <div className="muted">{user.displayName}</div>
          </div>
        </Space>
      ),
    },
    {
      title: "角色",
      dataIndex: "role",
      width: 120,
      render: (role: UserRole) => <Tag color={role === "ADMIN" ? "blue" : "default"}>{roleLabels[role]}</Tag>,
    },
    {
      title: "所属班级",
      key: "classrooms",
      render: (_value, user) => user.memberships.length > 0
        ? user.memberships.map((membership) => (
          <Tag key={membership.id}>{membership.classroom.name}{membership.isDefault ? "（默认）" : ""}</Tag>
        ))
        : <span className="muted">未分配班级</span>,
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 100,
      render: (status: UserStatus) => <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>,
    },
    {
      title: "最近登录",
      dataIndex: "lastLoginAt",
      width: 160,
      render: (lastLoginAt: string | null) => lastLoginAt ? dayjs(lastLoginAt).format("YYYY-MM-DD HH:mm") : "从未登录",
    },
    {
      title: "操作",
      key: "actions",
      width: 290,
      render: (_value, user) => (
        <Space wrap size={[4, 4]}>
          {user.status === "PENDING" ? (
            <>
              <Button type="link" size="small" icon={<CheckOutlined />} onClick={() => openApprove(user)}>审核</Button>
              <Button type="link" size="small" danger icon={<StopOutlined />} onClick={() => confirmStatusChange(user, "DISABLED")}>拒绝</Button>
            </>
          ) : (
            <Button type="link" size="small" icon={<UserOutlined />} onClick={() => openEdit(user)}>编辑</Button>
          )}
          {user.id !== currentUserId && user.status !== "PENDING" && (
            <Button
              type="link"
              size="small"
              danger={user.status === "ACTIVE"}
              icon={user.status === "ACTIVE" ? <StopOutlined /> : <CheckOutlined />}
              onClick={() => confirmStatusChange(user, user.status === "ACTIVE" ? "DISABLED" : "ACTIVE")}
            >
              {user.status === "ACTIVE" ? "停用" : "启用"}
            </Button>
          )}
          {user.status !== "PENDING" && (
            <Button type="link" size="small" icon={<KeyOutlined />} onClick={() => openResetPassword(user)}>重置密码</Button>
          )}
          <Popconfirm
            title="撤销全部登录会话？"
            description="该用户需要重新登录。"
            okText="撤销"
            cancelText="取消"
            onConfirm={() => void revokeSessions(user)}
          >
            <Button type="link" size="small">撤销会话</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeading
        kicker="SYSTEM ADMINISTRATION"
        title="用户管理"
        description="审核注册申请，维护系统账号、角色和班级归属。"
        action={<Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增用户</Button>}
      />

      {error && (
        <Alert
          type="error"
          showIcon
          title={error.message}
          action={<Button type="text" icon={<ReloadOutlined />} onClick={() => void refresh()}>重试</Button>}
          style={{ marginBottom: 18 }}
        />
      )}

      <Row gutter={[16, 16]} className={styles.summaryGrid}>
        <Col xs={12} sm={6}><Card className="surface-card"><Statistic title="全部账号" value={summary.total} prefix={<UserOutlined />} /></Card></Col>
        <Col xs={12} sm={6}><Card className="surface-card"><Statistic title="待审核" value={summary.pending} prefix={<SafetyCertificateOutlined />} styles={{ content: { color: "var(--warning)" } }} /></Card></Col>
        <Col xs={12} sm={6}><Card className="surface-card"><Statistic title="已启用" value={summary.active} prefix={<CheckOutlined />} styles={{ content: { color: "var(--success)" } }} /></Card></Col>
        <Col xs={12} sm={6}><Card className="surface-card"><Statistic title="已停用" value={summary.disabled} prefix={<StopOutlined />} styles={{ content: { color: "var(--muted)" } }} /></Card></Col>
      </Row>

      <Card className={`surface-card ${styles.tableCard}`}>
        <div className={styles.toolbar}>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索账号或姓名"
            aria-label="搜索账号或姓名"
            onSearch={setSearchQuery}
            onChange={(event) => { if (!event.target.value) setSearchQuery(""); }}
            style={{ maxWidth: 320 }}
          />
          <Select
            aria-label="用户状态筛选"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "ALL", label: "全部状态" },
              { value: "PENDING", label: "待审核" },
              { value: "ACTIVE", label: "已启用" },
              { value: "DISABLED", label: "已停用" },
            ]}
            style={{ width: 130 }}
          />
        </div>
        {users.length === 0 && !loading ? (
          <Empty description="暂无用户记录" />
        ) : (
          <Table<AdminUser>
            rowKey="id"
            loading={loading || classroomsLoading}
            columns={columns}
            dataSource={users}
            pagination={false}
            scroll={{ x: 980 }}
          />
        )}
      </Card>

      <Modal
        title={editorMode === "create" ? "新增用户" : editorMode === "approve" ? "审核注册申请" : "编辑用户"}
        open={editorOpen}
        onCancel={closeEditor}
        onOk={() => void saveEditor()}
        okText={editorMode === "approve" ? "批准并开通" : "保存"}
        confirmLoading={editorSaving}
        destroyOnHidden
      >
        {editorMode === "create" && <Alert type="info" showIcon title="新用户初始密码为 123456，首次登录后请及时修改。" style={{ marginBottom: 18 }} />}
        {editorMode === "approve" && <Alert type="info" showIcon title="批准后该用户将获得班主任权限，并可以登录系统。" style={{ marginBottom: 18 }} />}
        <Form<UserFormValues> form={editorForm} layout="vertical" requiredMark={false}>
          {editorMode === "create" && (
            <Form.Item name="username" label="账号" rules={[{ required: true, message: "请输入账号" }]}>
              <Input prefix={<UserOutlined />} autoComplete="username" />
            </Form.Item>
          )}
          {editorMode !== "approve" && editorMode === "edit" && (
            <Form.Item label="账号">
              <Input value={editingUser?.username} disabled />
            </Form.Item>
          )}
          <Form.Item name="displayName" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
            <Input prefix={<UserOutlined />} autoComplete="name" />
          </Form.Item>
          {editorMode !== "approve" && (
            <Form.Item name="role" label="角色" rules={[{ required: true, message: "请选择角色" }]}>
              <Select options={Object.entries(roleLabels).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
          )}
          {editorMode === "edit" && (
            <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择状态" }]}>
              <Select options={[{ value: "ACTIVE", label: "已启用" }, { value: "DISABLED", label: "已停用" }]} />
            </Form.Item>
          )}
          <Form.Item
            name="classId"
            label="默认班级"
            dependencies={["role", "status"]}
            rules={[
              ({ getFieldValue }) => ({
                validator(_, value: string | undefined) {
                  if (editorMode === "create" && !value) return Promise.reject(new Error("请选择默认班级"));
                  const role = editorMode === "approve" ? "HEAD_TEACHER" : getFieldValue("role");
                  const status = editorMode === "create" || editorMode === "approve" ? "ACTIVE" : getFieldValue("status");
                  if (role === "HEAD_TEACHER" && status === "ACTIVE" && !value) return Promise.reject(new Error("启用班主任必须分配默认班级"));
                  return Promise.resolve();
                },
              }),
            ]}
          >
            <Select
              allowClear
              loading={classroomsLoading}
              placeholder="请选择默认班级"
              options={classrooms.map((classroom) => ({ value: classroom.id, label: `${classroom.name} · ${classroom.academicYear}` }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`重置密码 · ${resetUser?.displayName ?? ""}`}
        open={resetOpen}
        onCancel={() => { setResetOpen(false); setResetUser(null); }}
        onOk={() => void resetPassword()}
        okText="确认重置"
        confirmLoading={resetSaving}
        destroyOnHidden
      >
        <Alert type="warning" showIcon title="重置后该用户的旧登录会话会立即失效。" style={{ marginBottom: 18 }} />
        <Form form={resetForm} layout="vertical" requiredMark={false}>
          <Form.Item name="password" label="新密码" rules={[{ required: true, min: 8, message: "密码至少需要 8 位" }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="confirmPassword" label="确认新密码" dependencies={["password"]} rules={[{ required: true, message: "请再次输入密码" }, ({ getFieldValue }) => ({ validator(_, value: string) { return !value || getFieldValue("password") === value ? Promise.resolve() : Promise.reject(new Error("两次输入的密码不一致")); } })]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function AvatarInitial({ name }: { name: string }) {
  return <span className={styles.avatarInitial} aria-hidden="true">{name.slice(0, 1)}</span>;
}
