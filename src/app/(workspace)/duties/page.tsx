"use client";

import {
  AppstoreOutlined,
  BarsOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  PlusOutlined,
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
  Segmented,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
} from "antd";
import type { TableColumnsType } from "antd";
import { useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

import styles from "./duties.module.css";

interface Student { id: string; name: string; studentNo: string }
interface DutyGroup {
  id: string; name: string; weekday: number; area: string; notes: string | null; sortOrder: number;
  assignments: Array<{ student: Student }>;
}
interface DutyData { groups: DutyGroup[]; students: Student[] }
interface DutyValues { name: string; weekday: number; area: string; notes?: string; studentIds: string[] }

const weekdays = ["周一", "周二", "周三", "周四", "周五"];

export default function DutiesPage() {
  const { message } = App.useApp();
  const { data, loading, error, refresh } = useApiData<DutyData>("/api/duties");
  const [form] = Form.useForm<DutyValues>();
  const [editing, setEditing] = useState<DutyGroup | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const todayWeekday = new Date().getDay() || 7;

  const groups = [...(data?.groups ?? [])]
    .filter((group) => group.weekday >= 1 && group.weekday <= weekdays.length)
    .sort((a, b) => a.weekday - b.weekday || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const todayGroup = groups.find((g) => g.weekday === todayWeekday);

  function openEditor(group?: DutyGroup) {
    setEditing(group ?? null);
    form.resetFields();
    form.setFieldsValue(group ? {
      name: group.name,
      weekday: group.weekday,
      area: group.area,
      notes: group.notes ?? undefined,
      studentIds: group.assignments.map((item) => item.student.id),
    } : { weekday: 1, studentIds: [] });
    setModalOpen(true);
  }

  function closeEditor() {
    setModalOpen(false);
    form.resetFields();
    setEditing(null);
  }

  async function saveGroup() {
    const values = await form.validateFields();
    setSaving(true);
    try {
      await apiRequest(editing ? `/api/duties/${editing.id}` : "/api/duties", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(values),
      });
      message.success(editing ? "值日安排已更新" : "值日小组已创建");
      closeEditor();
      await refresh();
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteGroup(id: string) {
    try {
      await apiRequest(`/api/duties/${id}`, { method: "DELETE" });
      message.success("值日小组已删除");
      await refresh();
    } catch (deleteError) {
      message.error((deleteError as Error).message);
    }
  }

  const tableColumns: TableColumnsType<DutyGroup> = [
    {
      title: "值日日期",
      key: "weekday",
      width: 140,
      render: (_, group) => {
        const isToday = group.weekday === todayWeekday;
        return (
          <Space orientation="horizontal" size={8}>
            <span className={isToday ? `${styles.dutyDayNum} ${styles.dutyCardToday}` : styles.dutyDayNum}>
              0{group.weekday}
            </span>
            <div>
              <strong style={{ display: "block", color: isToday ? "var(--primary)" : "var(--ink)" }}>
                {weekdays[group.weekday - 1]}
              </strong>
              <small style={{ color: "var(--muted)" }}>{group.name}</small>
            </div>
            {isToday && <span className={styles.dutyTodayTag}>今日</span>}
          </Space>
        );
      },
    },
    {
      title: "负责区域",
      dataIndex: "area",
      key: "area",
      width: 180,
      render: (area: string) => (
        <span className={styles.dutyAreaBox} style={{ display: "inline-flex" }}>
          <EnvironmentOutlined className={styles.dutyAreaIcon} />
          <span>{area}</span>
        </span>
      ),
    },
    {
      title: "值日成员",
      key: "assignments",
      render: (_, group) => (
        <div className={styles.dutyMembersList}>
          {group.assignments.length > 0 ? (
            group.assignments.map((item) => (
              <span className={styles.dutyMemberChip} key={item.student.id}>
                {item.student.name}
              </span>
            ))
          ) : (
            <span className={styles.dutyMembersEmpty}>待分配成员</span>
          )}
        </div>
      ),
    },
    {
      title: "清洁提醒",
      dataIndex: "notes",
      key: "notes",
      width: 200,
      render: (notes: string | null) => (
        <div className={styles.dutyNotesBox} style={{ margin: 0 }}>
          <ClockCircleOutlined className={styles.dutyNotesIcon} />
          <span>{notes || "按常规要求完成值日"}</span>
        </div>
      ),
    },
    {
      title: "操作",
      key: "actions",
      width: 90,
      align: "right",
      render: (_, group) => (
        <Space size={2}>
          <Tooltip title="编辑安排">
            <Button
              type="text"
              size="small"
              aria-label={`编辑${group.name}`}
              icon={<EditOutlined />}
              onClick={() => openEditor(group)}
            />
          </Tooltip>
          <Popconfirm
            title="删除这个值日小组？"
            okText="删除"
            cancelText="取消"
            onConfirm={() => void deleteGroup(group.id)}
          >
            <Tooltip title="删除安排">
              <Button
                type="text"
                size="small"
                danger
                aria-label={`删除${group.name}`}
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeading
        kicker="DUTY ROSTER"
        title="班级值日安排"
        description="按周一至周五清晰规划值日小组、负责区域及卫生提醒，保障日常班级环境。"
        action={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新增小组</Button>}
      />

      {error && <Alert showIcon type="error" title={error.message} style={{ marginBottom: 16 }} />}

      {/* 状态汇总条 */}
      <section className={styles.summaryStrip}>
        <div className={styles.summaryLead}>
          <span className={styles.summaryIcon}><CalendarOutlined /></span>
          <div className={styles.summaryCopy}>
            <h2 className={styles.summaryTitle}>一周值日统筹管理</h2>
            <p className={styles.summaryDesc}>
              已安排 {groups.length} 个值日小组，共涵盖周一至周五的日常清洁与重点值勤。
            </p>
          </div>
        </div>

        <div className={styles.summaryActions}>
          {todayGroup ? (
            <div className={styles.todayIndicator}>
              <span className={styles.todayDot} />
              <span>今日（{weekdays[todayGroup.weekday - 1]}）：{todayGroup.name} · {todayGroup.area}</span>
            </div>
          ) : (
            <div className={styles.todayIndicator} style={{ background: "rgba(1, 81, 134, 0.08)", borderColor: "rgba(1, 81, 134, 0.2)", color: "var(--primary)" }}>
              <span>今日暂无特别指定值日排班</span>
            </div>
          )}

          <Segmented
            value={viewMode}
            onChange={(val) => setViewMode(val as "cards" | "table")}
            options={[
              { value: "cards", icon: <AppstoreOutlined />, label: "周卡片" },
              { value: "table", icon: <BarsOutlined />, label: "列表" },
            ]}
          />
        </div>
      </section>

      {loading && groups.length === 0 ? (
        <Card className="surface-card" style={{ padding: 60, textAlign: "center" }}>
          <Spin description="正在加载班级值日安排..." />
        </Card>
      ) : groups.length === 0 ? (
        <Card className="surface-card" style={{ padding: 60, textAlign: "center" }}>
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未安排值日小组，点击上方“新增小组”开始规划" />
        </Card>
      ) : viewMode === "cards" ? (
        /* 卡片视图 */
        <div className={styles.dutyGrid}>
          {groups.map((group) => {
            const isToday = group.weekday === todayWeekday;
            return (
              <article
                className={isToday ? `${styles.dutyCard} ${styles.dutyCardToday}` : styles.dutyCard}
                key={group.id}
              >
                <div className={styles.dutyCardHeader}>
                  <div className={styles.dutyWeekdayBadge}>
                    <span className={styles.dutyDayNum}>0{group.weekday}</span>
                    <div>
                      <span className={styles.dutyWeekdayName}>{weekdays[group.weekday - 1]}</span>
                      <span className={styles.dutyGroupName}> · {group.name}</span>
                    </div>
                  </div>
                  <div className={styles.dutyCardActions}>
                    {isToday && <span className={styles.dutyTodayTag}>今日</span>}
                    <Tooltip title="编辑安排">
                      <Button
                        type="text"
                        size="small"
                        aria-label={`编辑${group.name}`}
                        icon={<EditOutlined />}
                        onClick={() => openEditor(group)}
                      />
                    </Tooltip>
                    <Popconfirm
                      title="删除这个值日小组？"
                      okText="删除"
                      cancelText="取消"
                      onConfirm={() => void deleteGroup(group.id)}
                    >
                      <Tooltip title="删除安排">
                        <Button
                          type="text"
                          size="small"
                          danger
                          aria-label={`删除${group.name}`}
                          icon={<DeleteOutlined />}
                        />
                      </Tooltip>
                    </Popconfirm>
                  </div>
                </div>

                <div className={styles.dutyCardBody}>
                  {/* 负责区域 */}
                  <div className={styles.dutyAreaBox}>
                    <EnvironmentOutlined className={styles.dutyAreaIcon} />
                    <span className={styles.dutyAreaText}>{group.area}</span>
                  </div>

                  {/* 值日成员 */}
                  <div className={styles.dutyMembersSection}>
                    <div className={styles.dutySectionLabel}>值日学生 ({group.assignments.length}人)</div>
                    <div className={styles.dutyMembersList}>
                      {group.assignments.length > 0 ? (
                        group.assignments.map((item) => (
                          <span className={styles.dutyMemberChip} key={item.student.id}>
                            {item.student.name}
                          </span>
                        ))
                      ) : (
                        <span className={styles.dutyMembersEmpty}>待分配成员</span>
                      )}
                    </div>
                  </div>

                  {/* 清洁提醒 */}
                  <div className={styles.dutyNotesBox}>
                    <ClockCircleOutlined className={styles.dutyNotesIcon} />
                    <span>{group.notes || "按常规清洁规范完成值日"}</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        /* 表格视图 */
        <div className={styles.tableCard}>
          <Table
            columns={tableColumns}
            dataSource={groups}
            rowKey="id"
            pagination={false}
            rowClassName={(record) => record.weekday === todayWeekday ? "duty-row-today" : ""}
            scroll={{ x: 720 }}
          />
          <div className={styles.footerTips}>
            <InfoCircleOutlined className={styles.footerTipsIcon} />
            <span>若遇特殊情况或调课不能值日，请提前向组长或班主任说明并协调换班。</span>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Modal
        title={editing ? "编辑值日安排" : "新增值日小组"}
        open={modalOpen}
        onCancel={closeEditor}
        onOk={() => void saveGroup()}
        confirmLoading={saving}
        okText="保存安排"
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Row gutter={14}>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="小组名称" rules={[{ required: true, message: "请输入小组名称" }]}>
                <Input placeholder="如：第一组" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="weekday" label="值日日期" rules={[{ required: true, message: "请选择值日日期" }]}>
                <Select options={weekdays.map((label, index) => ({ value: index + 1, label }))} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="area" label="负责区域" rules={[{ required: true, message: "请输入负责区域" }]}>
            <Input placeholder="教室、走廊、卫生包干区" />
          </Form.Item>
          <Form.Item name="studentIds" label="值日成员">
            <Select
              mode="multiple"
              optionFilterProp="label"
              placeholder="选择值日成员"
              options={(data?.students ?? []).map((student) => ({
                value: student.id,
                label: `${student.name} · ${student.studentNo}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="notes" label="清洁提醒">
            <Input.TextArea rows={2} placeholder="如：早读前完成黑板擦拭和地面保洁，放学后倒垃圾" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
