"use client";

import { BookOutlined, CheckOutlined, CrownOutlined, DeleteOutlined, EditOutlined, PlusOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, App, Avatar, Button, Empty, Form, Input, InputNumber, Modal, Select, Skeleton, Space, Tooltip } from "antd";
import { useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

interface Student { id: string; name: string; studentNo: string }
interface CommitteeMember { id?: string; studentId: string; title: string; responsibilities: string | null; sortOrder: number; student?: Student }
interface CommitteeData { members: CommitteeMember[]; students: Student[] }
type MemberValues = Omit<CommitteeMember, "id" | "student">;

function memberKey(member: CommitteeMember) {
  return member.id ?? `${member.title}-${member.studentId}`;
}

function studentName(member: CommitteeMember) {
  return member.student?.name ?? "未分配学生";
}

function avatarText(member: CommitteeMember) {
  return studentName(member).slice(0, 1) || "班";
}

export default function CommitteePage() {
  const { message } = App.useApp();
  const { data, loading, error, refresh } = useApiData<CommitteeData>("/api/committee");
  const [members, setMembers] = useState<CommitteeMember[]>([]);
  const [sourceData, setSourceData] = useState<CommitteeData | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<MemberValues>();

  if (data && data !== sourceData) {
    setSourceData(data);
    setMembers(data.members);
  }

  const sortedMembers = [...members].sort((a, b) => a.sortOrder - b.sortOrder);
  const leaders = sortedMembers.slice(0, 2);
  const otherMembers = sortedMembers.slice(2);

  function openEditor(member?: CommitteeMember) {
    const index = member ? members.findIndex((item) => item.id && member.id ? item.id === member.id : item === member) : -1;
    setEditingIndex(index >= 0 ? index : null);
    form.resetFields();
    form.setFieldsValue(member ? {
      studentId: member.studentId,
      title: member.title,
      responsibilities: member.responsibilities,
      sortOrder: member.sortOrder,
    } : { sortOrder: members.length });
    setModalOpen(true);
  }

  function removeMember(member: CommitteeMember) {
    setMembers((current) => current.filter((item) => item !== member && !(item.id && member.id && item.id === member.id)));
  }

  async function applyMember() {
    const values = await form.validateFields();
    const student = data?.students.find((item) => item.id === values.studentId);
    if (editingIndex === null) setMembers((current) => [...current, { ...values, student }]);
    else setMembers((current) => current.map((item, index) => index === editingIndex ? { ...item, ...values, student } : item));
    setModalOpen(false);
    form.resetFields();
  }

  async function saveAll() {
    setSaving(true);
    try {
      await apiRequest("/api/committee", {
        method: "PUT",
        body: JSON.stringify({
          members: members.map((member) => ({
            studentId: member.studentId,
            title: member.title,
            responsibilities: member.responsibilities,
            sortOrder: member.sortOrder,
          })),
        }),
      });
      message.success("班委名单已保存");
      await refresh();
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function renderCardActions(member: CommitteeMember) {
    return (
      <div className="card-actions">
        <Tooltip title="编辑">
          <Button type="text" aria-label={`编辑${studentName(member)}的${member.title}职务`} icon={<EditOutlined />} onClick={() => openEditor(member)} />
        </Tooltip>
        <Tooltip title="删除">
          <Button type="text" danger aria-label={`删除${studentName(member)}的${member.title}职务`} icon={<DeleteOutlined />} onClick={() => removeMember(member)} />
        </Tooltip>
      </div>
    );
  }

  return (
    <>
      <PageHeading
        kicker="CLASS COMMITTEE"
        title="班级组织架构"
        description="明确班级自治分工，让每个职务都有清晰的责任边界。"
        action={<Space><Button icon={<PlusOutlined />} onClick={() => openEditor()}>添加职务</Button><Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveAll()}>保存名单</Button></Space>}
      />
      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}

      {loading && members.length === 0 ? <div className="committee-loading"><Skeleton active paragraph={{ rows: 7 }} /></div> : members.length === 0 ? (
        <div className="committee-empty"><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无班委成员" /></div>
      ) : (
        <div className="committee-layout">
          <section className="committee-leadership" aria-labelledby="committee-leadership-title">
            <div className="committee-section-heading">
              <CrownOutlined aria-hidden="true" />
              <h2 id="committee-leadership-title">核心负责人</h2>
              <span className="committee-section-count">{leaders.length} 人</span>
            </div>
            <div className="committee-leaders">
              {leaders.map((member, index) => (
                <article className={`committee-leader-card committee-leader-card-${index + 1}`} key={memberKey(member)}>
                  <div className="committee-card-header">
                    <div className="committee-member-profile">
                      <Avatar className={`member-avatar member-avatar-leader member-avatar-${index + 1}`} size={64}>{avatarText(member)}</Avatar>
                      <div className="committee-member-copy">
                        <h3 className="committee-member-name">{studentName(member)}</h3>
                        <span className="committee-role">{member.title}</span>
                        <span className="committee-student-no">{member.student?.studentNo ?? "未填写学号"}</span>
                      </div>
                    </div>
                    {renderCardActions(member)}
                  </div>
                  <div className="committee-responsibility">
                    <CheckOutlined aria-hidden="true" />
                    <p>{member.responsibilities || "暂未填写职责说明"}</p>
                  </div>
                  <div className="committee-card-order">第 {member.sortOrder + 1} 位负责人</div>
                </article>
              ))}
            </div>
          </section>

          {otherMembers.length > 0 && (
            <section className="committee-members" aria-labelledby="committee-members-title">
              <div className="committee-section-heading">
                <BookOutlined aria-hidden="true" />
                <h2 id="committee-members-title">其他班委成员</h2>
                <span className="committee-section-count">{otherMembers.length} 人</span>
              </div>
              <div className="committee-member-grid">
                {otherMembers.map((member) => (
                  <article className="committee-member-card" key={memberKey(member)}>
                    <Avatar className="member-avatar member-avatar-compact" size={48}>{avatarText(member)}</Avatar>
                    <div className="committee-member-copy">
                      <h3 className="committee-member-name">{studentName(member)}</h3>
                      <span className="committee-role">{member.title}</span>
                      <span className="committee-member-responsibility">{member.responsibilities || "职责待补充"}</span>
                    </div>
                    {renderCardActions(member)}
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Modal title={editingIndex === null ? "添加班委职务" : "编辑班委职务"} open={modalOpen} onCancel={() => { setModalOpen(false); form.resetFields(); }} onOk={() => void applyMember()} okText="加入名单" destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="title" label="职务" rules={[{ required: true, message: "请输入职务" }]}><Input placeholder="如：学习委员" /></Form.Item>
          <Form.Item name="studentId" label="学生" rules={[{ required: true, message: "请选择学生" }]}><Select showSearch optionFilterProp="label" options={(data?.students ?? []).map((student) => ({ value: student.id, label: `${student.name} · ${student.studentNo}` }))} /></Form.Item>
          <Form.Item name="responsibilities" label="职责说明"><Input.TextArea rows={3} /></Form.Item>
          <Form.Item name="sortOrder" label="显示顺序" rules={[{ required: true }]}><InputNumber min={0} style={{ width: "100%" }} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
