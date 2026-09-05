"use client";

import {
  BookOutlined,
  CheckOutlined,
  CrownOutlined,
  DeleteOutlined,
  EditOutlined,
  PlusOutlined,
  SaveOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Tooltip,
} from "antd";
import { useState } from "react";

import { LedgerSheet } from "@/components/layout/LedgerSheet";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

import styles from "./committee.module.css";

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

interface RoleTheme {
  avatarBg: string;
  avatarColor: string;
  avatarBorder: string;
  tagBg: string;
  tagColor: string;
  tagBorder: string;
  accent: string;
}

function getRoleTheme(title: string): RoleTheme {
  if (title.includes("学习") || title.includes("科") || title.includes("课代表")) {
    return {
      avatarBg: "#eff6ff",
      avatarColor: "#2563eb",
      avatarBorder: "#bfdbfe",
      tagBg: "#eff6ff",
      tagColor: "#1d4ed8",
      tagBorder: "#bfdbfe",
      accent: "#3b82f6",
    };
  }
  if (title.includes("纪律") || title.includes("组织") || title.includes("治安")) {
    return {
      avatarBg: "#f5f3ff",
      avatarColor: "#7c3aed",
      avatarBorder: "#ddd6fe",
      tagBg: "#f5f3ff",
      tagColor: "#6d28d9",
      tagBorder: "#ddd6fe",
      accent: "#8b5cf6",
    };
  }
  if (title.includes("卫生") || title.includes("劳动") || title.includes("生活") || title.includes("环保")) {
    return {
      avatarBg: "#f0fdf4",
      avatarColor: "#16a34a",
      avatarBorder: "#bbf7d0",
      tagBg: "#f0fdf4",
      tagColor: "#15803d",
      tagBorder: "#bbf7d0",
      accent: "#22c55e",
    };
  }
  if (title.includes("体") || title.includes("文") || title.includes("艺") || title.includes("康")) {
    return {
      avatarBg: "#fffbeb",
      avatarColor: "#d97706",
      avatarBorder: "#fde68a",
      tagBg: "#fffbeb",
      tagColor: "#b45309",
      tagBorder: "#fde68a",
      accent: "#f59e0b",
    };
  }
  if (title.includes("宣传") || title.includes("团") || title.includes("外联") || title.includes("心理")) {
    return {
      avatarBg: "#fff1f2",
      avatarColor: "#e11d48",
      avatarBorder: "#fecdd3",
      tagBg: "#fff1f2",
      tagColor: "#be123c",
      tagBorder: "#fecdd3",
      accent: "#f43f5e",
    };
  }
  return {
    avatarBg: "#e0f2fe",
    avatarColor: "#0284c7",
    avatarBorder: "#bae6fd",
    tagBg: "#e0f2fe",
    tagColor: "#0369a1",
    tagBorder: "#bae6fd",
    accent: "#0284c7",
  };
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
      <div className={styles.cardActions}>
        <Tooltip title="编辑职务">
          <Button
            type="text"
            size="small"
            aria-label={`编辑${studentName(member)}的${member.title}职务`}
            icon={<EditOutlined />}
            onClick={() => openEditor(member)}
          />
        </Tooltip>
        <Tooltip title="移除职务">
          <Button
            type="text"
            size="small"
            danger
            aria-label={`删除${studentName(member)}的${member.title}职务`}
            icon={<DeleteOutlined />}
            onClick={() => removeMember(member)}
          />
        </Tooltip>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <LedgerSheet
        kicker="CLASS COMMITTEE"
        title="班级组织架构"
        description="明确班级自治分工，班长统筹引领，各委员职责明晰，协同推进班风学风建设。"
        actions={(
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => openEditor()}>添加职务</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveAll()}>保存名单</Button>
          </Space>
        )}
        metrics={[
          {
            label: "LEADERS // 核心主持",
            value: leaders.length,
            unit: "位",
            detail: "班长与团支书统筹",
            icon: <CrownOutlined />,
          },
          {
            label: "COMMISSIONERS // 班委委员",
            value: otherMembers.length,
            unit: "位",
            detail: "分管专项工作",
            icon: <TeamOutlined />,
          },
          {
            label: "TOTAL // 团队人数",
            value: members.length,
            unit: "人",
            detail: "班级自治干部团队",
            icon: <BookOutlined />,
          },
        ]}
      >
        <div className={styles.contentWrap}>
          {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}

          {loading && members.length === 0 ? (
            <Card className="surface-card" style={{ padding: 40 }}>
              <Skeleton active paragraph={{ rows: 8 }} />
            </Card>
          ) : members.length === 0 ? (
            <Card className="surface-card" style={{ padding: 60, textAlign: "center" }}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无班委成员，点击上方“添加职务”开始设置" />
            </Card>
          ) : (
            <>
              {/* 核心负责人 */}
              <section aria-labelledby="committee-leadership-title">
                <div className={styles.sectionHeader}>
                  <CrownOutlined className={styles.sectionIcon} aria-hidden="true" />
                  <h2 id="committee-leadership-title">核心负责人</h2>
                  <span className={styles.sectionCount}>{leaders.length} 人</span>
                </div>

                <div className={styles.leadersGrid}>
                  {leaders.map((member, index) => {
                    const isFirst = index === 0;
                    return (
                      <article
                        className={`${styles.leaderCard} ${isFirst ? styles.leaderCardPrimary : styles.leaderCardSecondary}`}
                        key={memberKey(member)}
                      >
                        <div className={styles.leaderHeader}>
                          <div className={styles.leaderProfile}>
                            <div className={`${styles.leaderAvatar} ${isFirst ? styles.avatarGold : styles.avatarBlue}`}>
                              {avatarText(member)}
                            </div>
                            <div className={styles.leaderMeta}>
                              <div className={styles.leaderNameRow}>
                                <h3 className={styles.leaderName}>{studentName(member)}</h3>
                                <span className={`${styles.leaderRoleTag} ${isFirst ? styles.roleTagGold : styles.roleTagBlue}`}>
                                  {member.title}
                                </span>
                              </div>
                              <span className={styles.leaderStudentNo}>
                                学号：{member.student?.studentNo ?? "未登记"}
                              </span>
                            </div>
                          </div>
                          {renderCardActions(member)}
                        </div>

                        <div className={styles.leaderResponsibility}>
                          <CheckOutlined className={styles.checkIcon} aria-hidden="true" />
                          <p>{member.responsibilities || "全面统筹班级各项日常事务，协调各委员工作，联系班主任与科任老师。"}</p>
                        </div>

                        <div className={styles.orderBadge}>第 {member.sortOrder + 1} 席位负责人</div>
                      </article>
                    );
                  })}
                </div>
              </section>

              {/* 其他班委成员 */}
              {otherMembers.length > 0 && (
                <section aria-labelledby="committee-members-title">
                  <div className={styles.sectionHeader}>
                    <TeamOutlined className={styles.sectionIcon} aria-hidden="true" />
                    <h2 id="committee-members-title">班委委员名单</h2>
                    <span className={styles.sectionCount}>{otherMembers.length} 人</span>
                  </div>

                  <div className={styles.membersGrid}>
                    {otherMembers.map((member) => {
                      const theme = getRoleTheme(member.title);
                      return (
                        <article
                          className={styles.memberCard}
                          key={memberKey(member)}
                          style={{ borderTop: `3.5px solid ${theme.accent}` }}
                        >
                          <div className={styles.memberCardHeader}>
                            <div
                              className={styles.memberAvatar}
                              style={{
                                background: theme.avatarBg,
                                color: theme.avatarColor,
                                borderColor: theme.avatarBorder,
                              }}
                            >
                              {avatarText(member)}
                            </div>
                            <div className={styles.memberCopy}>
                              <div className={styles.memberNameRow}>
                                <h3 className={styles.memberName} title={studentName(member)}>
                                  {studentName(member)}
                                </h3>
                                {renderCardActions(member)}
                              </div>
                              <span
                                className={styles.memberRoleBadge}
                                style={{
                                  background: theme.tagBg,
                                  color: theme.tagColor,
                                  borderColor: theme.tagBorder,
                                }}
                              >
                                {member.title}
                              </span>
                              <span className={styles.memberStudentNo}>
                                学号：{member.student?.studentNo ?? "未登记"}
                              </span>
                            </div>
                          </div>

                          <div className={styles.memberResponsibility} title={member.responsibilities || "暂未填写职责说明"}>
                            {member.responsibilities || "协助班级开展专项管理与活动组织。"}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </LedgerSheet>

      {/* 职务编辑弹窗 */}
      <Modal
        title={editingIndex === null ? "添加班委职务" : "编辑班委职务"}
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); }}
        onOk={() => void applyMember()}
        okText="加入名单"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="title" label="职务名称" rules={[{ required: true, message: "请输入职务名称" }]}>
            <Input placeholder="如：学习委员、纪律委员、体育委员、文娱委员、生活委员" />
          </Form.Item>
          <Form.Item name="studentId" label="任职学生" rules={[{ required: true, message: "请选择学生" }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="搜索并选择学生"
              options={(data?.students ?? []).map((student) => ({
                value: student.id,
                label: `${student.name} · ${student.studentNo}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="responsibilities" label="职责说明">
            <Input.TextArea rows={3} placeholder="详细职责要求与主要分管工作" />
          </Form.Item>
          <Form.Item name="sortOrder" label="排序权重" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
