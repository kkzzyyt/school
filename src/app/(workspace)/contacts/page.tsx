"use client";

import {
  BankOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  FilterOutlined,
  PhoneOutlined,
  PlusOutlined,
  SearchOutlined,
  StarFilled,
  TeamOutlined,
  WechatOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Col, Empty, Form, Input, Modal, Popconfirm, Row, Select, Skeleton, Space, Switch, Tag } from "antd";
import { useMemo, useState } from "react";

import { LedgerSheet } from "@/components/layout/LedgerSheet";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

interface Guardian { id: string; name: string; relationship: string; phone: string; wechat: string | null; workplace: string | null; isPrimary: boolean }
interface Student { id: string; name: string; studentNo: string; guardians: Guardian[] }
interface StudentsResponse { items: Student[]; meta: { total: number } }
interface ContactRow extends Guardian { studentId: string; studentName: string; studentNo: string }
interface ContactValues { studentId: string; name: string; relationship: string; phone: string; wechat?: string; workplace?: string; isPrimary: boolean }

export default function ContactsPage() {
  const { message } = App.useApp();
  const { data, loading, error, refresh } = useApiData<StudentsResponse>("/api/students?pageSize=100");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [primaryOnly, setPrimaryOnly] = useState(false);
  const [form] = Form.useForm<ContactValues>();

  const rows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (data?.items ?? [])
      .flatMap((student) => student.guardians.map((guardian) => ({
        ...guardian, studentId: student.id, studentName: student.name, studentNo: student.studentNo,
      })))
      .filter((item) => [item.name, item.phone, item.studentName, item.studentNo]
        .some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [data, query]);

  const visibleRows = useMemo(
    () => primaryOnly ? rows.filter((contact) => contact.isPrimary) : rows,
    [primaryOnly, rows],
  );

  function openEditor(contact?: ContactRow) {
    setEditing(contact ?? null);
    form.resetFields();
    form.setFieldsValue(contact ? {
      studentId: contact.studentId,
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      wechat: contact.wechat ?? undefined,
      workplace: contact.workplace ?? undefined,
      isPrimary: contact.isPrimary,
    } : { isPrimary: false });
    setModalOpen(true);
  }

  function closeEditor() {
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  }

  async function saveContact() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      const { studentId, ...payload } = values;
      await apiRequest(editing ? `/api/guardians/${editing.id}` : `/api/students/${studentId}/guardians`, {
        method: editing ? "PATCH" : "POST", body: JSON.stringify(payload),
      });
      message.success(editing ? "联系人已更新" : "联系人已添加");
      closeEditor();
      await refresh();
    } catch (saveError) { message.error((saveError as Error).message); }
    finally { setSaving(false); }
  }

  async function deleteContact(id: string) {
    try {
      await apiRequest(`/api/guardians/${id}`, { method: "DELETE" });
      message.success("联系人已删除");
      await refresh();
    } catch (deleteError) { message.error((deleteError as Error).message); }
  }

  return (
    <>
      <LedgerSheet
        kicker="FAMILY CONTACTS"
        title="家长联系名录"
        description="高效管理学生家长联系方式，支持姓名、学号或电话检索。"
        actions={(
          <Space className="contacts-heading-actions" size={10}>
            <Button
              className="contacts-filter"
              icon={<FilterOutlined />}
              aria-pressed={primaryOnly}
              onClick={() => setPrimaryOnly((value) => !value)}
            >
              {primaryOnly ? "仅主联系人" : "筛选"}
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新增联系人</Button>
          </Space>
        )}
        metrics={[
          { label: "DIRECTORY // 当前联系人", value: visibleRows.length, unit: "位", detail: primaryOnly ? "仅显示主联系人" : "全部已维护联系人", icon: <TeamOutlined /> },
          { label: "PRIMARY // 主联系人", value: rows.filter((contact) => contact.isPrimary).length, unit: "位", detail: "家校沟通首选对象", icon: <StarFilled /> },
          { label: "STUDENT // 覆盖学生", value: data?.meta.total ?? "—", unit: "人", detail: query.trim() ? `检索“${query.trim()}”` : "当前班级学生", icon: <SearchOutlined /> },
        ]}
      >
      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}
      <div className="contacts-directory-section">
      <div className="contacts-toolbar">
        <Input
          className="contacts-search"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索姓名、学生或电话..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="contacts-count muted">共 {visibleRows.length} 位联系人</span>
      </div>
      {loading ? (
        <div className="contact-grid contact-grid-loading" aria-busy="true" aria-label="正在加载联系人">
          {["contact-skeleton-1", "contact-skeleton-2", "contact-skeleton-3"].map((key) => (
            <div className="contact-card" key={key}><Skeleton active paragraph={{ rows: 3 }} /></div>
          ))}
        </div>
      ) : visibleRows.length > 0 ? (
        <div className="contact-grid">
          {visibleRows.map((contact) => (
            <article className="contact-card" key={contact.id}>
              <div className="contact-card-header">
                <div className="contact-person">
                  <div className="contact-avatar" aria-hidden="true">{contact.name.slice(0, 1)}</div>
                  <div className="contact-details">
                    <div className="contact-title-row">
                      <h2>{contact.name} <span className="contact-student">（学生：{contact.studentName}）</span></h2>
                      {contact.isPrimary && <Tag className="contact-primary-tag" icon={<StarFilled />}>主联系人</Tag>}
                    </div>
                    <p>学号：{contact.studentNo}<span aria-hidden="true"> | </span>关系：{contact.relationship}</p>
                  </div>
                </div>
                <Space className="contact-card-actions" size={0}>
                  <Button
                    type="text"
                    icon={<EditOutlined />}
                    aria-label={`编辑${contact.name}`}
                    title="编辑联系人"
                    onClick={() => openEditor(contact)}
                  />
                  <Popconfirm title="删除这个联系人？" onConfirm={() => void deleteContact(contact.id)}>
                    <Button danger type="text" icon={<DeleteOutlined />} aria-label={`删除${contact.name}`} title="删除联系人" />
                  </Popconfirm>
                </Space>
              </div>
              <div className="contact-card-body">
                <div className="contact-info-row">
                  <PhoneOutlined className="contact-info-icon" aria-hidden="true" />
                  <a className="contact-phone" href={`tel:${contact.phone}`}>{contact.phone}</a>
                  <Button
                    className="contact-call-button"
                    type="text"
                    icon={<PhoneOutlined />}
                    href={`tel:${contact.phone}`}
                    aria-label={`拨打${contact.name}的电话`}
                    title="拨打电话"
                  />
                </div>
                <div className="contact-info-row">
                  <WechatOutlined className="contact-info-icon" aria-hidden="true" />
                  {contact.wechat ? (
                    <span className="contact-wechat">微信号：{contact.wechat}</span>
                  ) : (
                    <span className="contact-wechat contact-info-muted">未提供微信号</span>
                  )}
                  <Tag
                    className={`contact-wechat-status ${contact.wechat ? "contact-wechat-status-added" : "contact-wechat-status-empty"}`}
                    icon={contact.wechat ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                  >
                    {contact.wechat ? "已添加" : "未添加"}
                  </Tag>
                </div>
                {contact.workplace && (
                  <div className="contact-info-row contact-workplace">
                    <BankOutlined className="contact-info-icon" aria-hidden="true" />
                    <span>工作单位：{contact.workplace}</span>
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty className="contact-empty" description={query || primaryOnly ? "没有匹配的联系人" : "暂无联系人"} />
      )}
      </div>
      </LedgerSheet>
      <Modal title={editing ? "编辑家长联系人" : "新增家长联系人"} open={modalOpen} onCancel={closeEditor} onOk={() => void saveContact()} confirmLoading={saving} okText="保存联系人" destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="studentId" label="学生" rules={[{ required: true, message: "请选择学生" }]}><Select disabled={Boolean(editing)} showSearch optionFilterProp="label" options={(data?.items ?? []).map((student) => ({ value: student.id, label: `${student.name} · ${student.studentNo}` }))} /></Form.Item>
          <Row gutter={14}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="家长姓名" rules={[{ required: true, message: "请输入姓名" }]}><Input /></Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="relationship" label="与学生关系" rules={[{ required: true, message: "请输入关系" }]}><Input /></Form.Item>
            </Col>
          </Row>
          <Form.Item name="phone" label="手机号" rules={[{ required: true, message: "请输入手机号" }, { pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }]}><Input /></Form.Item>
          <Form.Item name="wechat" label="微信"><Input /></Form.Item>
          <Form.Item name="workplace" label="工作单位"><Input /></Form.Item>
          <Form.Item name="isPrimary" label="设为主联系人" valuePropName="checked"><Switch /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
