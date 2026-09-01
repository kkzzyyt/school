"use client";

import { EditOutlined, PlusOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import dayjs, { type Dayjs } from "dayjs";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

interface Guardian { id: string; name: string; relationship: string; phone: string; wechat: string | null; workplace: string | null; isPrimary: boolean }
interface Student {
  id: string; studentNo: string; name: string; gender: "MALE" | "FEMALE" | "OTHER";
  birthDate: string | null; phone: string | null; address: string | null; dormitory: string | null;
  status: "ACTIVE" | "SUSPENDED" | "TRANSFERRED" | "GRADUATED"; guardians: Guardian[];
}
interface StudentResponse { items: Student[]; meta: { total: number; page: number; pageSize: number } }
interface StudentFormValues {
  studentNo: string; name: string; gender: Student["gender"]; birthDate?: Dayjs; phone?: string;
  address?: string; dormitory?: string; status: Student["status"];
  guardianName?: string; relationship?: string; guardianPhone?: string;
}

const statusMap = {
  ACTIVE: { text: "在读", color: "green" },
  SUSPENDED: { text: "休学", color: "orange" },
  TRANSFERRED: { text: "转出", color: "default" },
  GRADUATED: { text: "毕业", color: "blue" },
} as const;

export default function StudentsPage() {
  const { message } = App.useApp();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("search") ?? "";
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<StudentFormValues>();
  const { data, loading, error, refresh } = useApiData<StudentResponse>(`/api/students?pageSize=100&q=${encodeURIComponent(query)}`);

  function changeQuery(nextQuery: string) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (nextQuery) nextSearchParams.set("search", nextQuery);
    else nextSearchParams.delete("search");
    const nextSearch = nextSearchParams.toString();
    router.replace(`${pathname}${nextSearch ? `?${nextSearch}` : ""}`, { scroll: false });
  }

  function openEditor(student?: Student) {
    setEditing(student ?? null);
    form.resetFields();
    const guardian = student?.guardians.find((item) => item.isPrimary) ?? student?.guardians[0];
    form.setFieldsValue(student ? {
      studentNo: student.studentNo,
      name: student.name,
      gender: student.gender,
      birthDate: student.birthDate ? dayjs(student.birthDate) : undefined,
      phone: student.phone ?? undefined,
      address: student.address ?? undefined,
      dormitory: student.dormitory ?? undefined,
      status: student.status,
      guardianName: guardian?.name,
      relationship: guardian?.relationship,
      guardianPhone: guardian?.phone,
    } : { gender: "MALE", status: "ACTIVE" });
    setModalOpen(true);
  }

  async function saveStudent() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const guardian = values.guardianName && values.guardianPhone ? [{
        name: values.guardianName,
        relationship: values.relationship ?? "家长",
        phone: values.guardianPhone,
        isPrimary: true,
      }] : [];
      const payload = {
        studentNo: values.studentNo,
        name: values.name,
        gender: values.gender,
        birthDate: values.birthDate?.format("YYYY-MM-DD") ?? null,
        phone: values.phone ?? null,
        address: values.address ?? null,
        dormitory: values.dormitory ?? null,
        status: values.status,
        ...(values.guardianName || !editing ? { guardians: guardian } : {}),
      };
      await apiRequest(editing ? `/api/students/${editing.id}` : "/api/students", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      message.success(editing ? "学生资料已更新" : "学生已加入花名册");
      setModalOpen(false);
      form.resetFields();
      await refresh();
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const columns: TableColumnsType<Student> = [
    { title: "学号", dataIndex: "studentNo", width: 125, render: (value) => <span className="muted">{value}</span> },
    { title: "姓名", dataIndex: "name", width: 110, render: (value) => <strong>{value}</strong> },
    { title: "性别", dataIndex: "gender", width: 75, render: (value) => value === "MALE" ? "男" : value === "FEMALE" ? "女" : "其他" },
    { title: "出生日期", dataIndex: "birthDate", width: 130, render: (value) => value ? dayjs(value).format("YYYY-MM-DD") : "—" },
    { title: "住宿", dataIndex: "dormitory", width: 100, render: (value) => value ?? "走读" },
    { title: "主联系人", width: 180, render: (_, student) => { const guardian = student.guardians.find((item) => item.isPrimary) ?? student.guardians[0]; return guardian ? <div><strong>{guardian.name}</strong><div className="muted" style={{ fontSize: 12 }}>{guardian.relationship} · {guardian.phone}</div></div> : "—"; } },
    { title: "状态", dataIndex: "status", width: 90, render: (value: Student["status"]) => <Tag color={statusMap[value].color}>{statusMap[value].text}</Tag> },
    { title: "操作", key: "action", fixed: "right", width: 90, render: (_, student) => <Button type="link" icon={<EditOutlined />} onClick={() => openEditor(student)}>编辑</Button> },
  ];

  return (
    <>
      <PageHeading kicker="STUDENT ROSTER" title="学生花名册" description="统一维护学生基本信息、学籍状态和住宿情况。" action={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新增学生</Button>} />
      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}
      <Card className="surface-card">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
          <Input allowClear prefix={<SearchOutlined />} placeholder="搜索姓名或学号" value={query} onChange={(event) => changeQuery(event.target.value)} style={{ width: 300 }} />
          <Space className="muted"><TeamOutlined /> 共 {data?.meta.total ?? 0} 名学生</Space>
        </div>
        <Table<Student> rowKey="id" columns={columns} dataSource={data?.items ?? []} loading={loading} pagination={{ pageSize: 12, showSizeChanger: false }} scroll={{ x: 980 }} />
      </Card>

      <Modal title={editing ? `编辑学生 · ${editing.name}` : "新增学生"} open={modalOpen} onCancel={() => { setModalOpen(false); form.resetFields(); }} onOk={() => void saveStudent()} confirmLoading={saving} okText="保存资料" width={720} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 20 }}>
          <Row gutter={16}>
            <Col xs={24} sm={8}><Form.Item name="studentNo" label="学号" rules={[{ required: true, message: "请输入学号" }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="gender" label="性别" rules={[{ required: true }]}><Select options={[{ value: "MALE", label: "男" }, { value: "FEMALE", label: "女" }, { value: "OTHER", label: "其他" }]} /></Form.Item></Col>
          </Row>
          <Row gutter={16}>
            <Col xs={24} sm={8}><Form.Item name="birthDate" label="出生日期"><DatePicker style={{ width: "100%" }} /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="dormitory" label="宿舍"><Input placeholder="留空表示走读" /></Form.Item></Col>
            <Col xs={24} sm={8}><Form.Item name="status" label="学籍状态"><Select options={Object.entries(statusMap).map(([value, item]) => ({ value, label: item.text }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="address" label="家庭住址"><Input /></Form.Item>
          <div style={{ margin: "8px 0 14px", fontWeight: 700 }}>主联系人</div>
          <Row gutter={16}>
            <Col xs={24} sm={8}><Form.Item name="guardianName" label="家长姓名"><Input /></Form.Item></Col>
            <Col xs={24} sm={7}><Form.Item name="relationship" label="关系"><Input placeholder="如：父亲" /></Form.Item></Col>
            <Col xs={24} sm={9}><Form.Item name="guardianPhone" label="手机号" rules={[{ pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }]}><Input /></Form.Item></Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
