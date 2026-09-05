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

import { PageHeading } from "@/components/layout/PageHeading";
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
      <PageHeading
        kicker="CLASS COMMITTEE"
        title="班级组织架构"
        description="明确班级自治分工，班长统筹引领，各委员职责明晰，协同推进班风学风建设。"
        action={(
          <Space>
            <Button icon={<PlusOutlined />} onClick={() => openEditor()}>添加职务</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveAll()}>保存名单</Button>
          </Space>
        )}
      />

      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}

      {/* 统筹状态条 */}
      <section className={styles.summaryStrip}>
        <div className={styles.summaryLead}>
          <span className={styles.summaryIcon}><CrownOutlined /></span>
          <div className={styles.summaryCopy}>
            <h2 className={styles.summaryTitle}>班级自治委员会</h2>
            <p className={styles.summaryDesc}>核心骨干主持班级日常事务，各学科与专项委员各司其职。</p>
          </div>
        </div>
        <div className={styles.summaryMetrics}>
          <div className={styles.metricBadge}>
            核心负责人 <strong>{leaders.length}</strong> 人
          </div>
          <div className={styles.metricBadge}>
            班委委员 <strong>{otherMembers.length}</strong> 人
          </div>
          <div className={styles.metricBadge} style={{ background: "rgba(1, 81, 134, 0.12)" }}>
            总计 <strong>{members.length}</strong> 人
          </div>
        </div>
      </section>

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
                {otherMembers.map((member) => (
                  <article className={styles.memberCard} key={memberKey(member)}>
                    <div className={styles.memberCardHeader}>
                      <div className={styles.memberAvatar}>
                        {avatarText(member)}
                      </div>
                      <div className={styles.memberCopy}>
                        <div className={styles.memberNameRow}>
                          <h3 className={styles.memberName} title={studentName(member)}>
                            {studentName(member)}
                          </h3>
                          {renderCardActions(member)}
                        </div>
                        <span className={styles.memberRoleBadge}>{member.title}</span>
                        <span className={styles.memberStudentNo}>
                          学号：{member.student?.studentNo ?? "未登记"}
                        </span>
                      </div>
                    </div>

                    <div className={styles.memberResponsibility} title={member.responsibilities || "暂未填写职责说明"}>
                      {member.responsibilities || "协助班级开展专项管理与活动组织。"}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}

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
