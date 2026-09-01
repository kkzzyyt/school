"use client";

import {
  CalendarOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  EnvironmentOutlined,
  InfoCircleOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Alert, App, Button, Card, Col, Empty, Form, Input, Modal, Popconfirm, Row, Select, Space, Spin, Tag, Tooltip } from "antd";
import { useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

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
  const todayWeekday = new Date().getDay() || 7;

  const groups = [...(data?.groups ?? [])]
    .filter((group) => group.weekday >= 1 && group.weekday <= weekdays.length)
    .sort((a, b) => a.weekday - b.weekday || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

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

  return (
    <>
      <PageHeading
        kicker="DUTY ROSTER"
        title="班级值日安排"
        description="按周一至周五查看值日小组、负责区域和清洁提醒。"
        action={<Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>新增小组</Button>}
      />

      {error && <Alert showIcon type="error" title={error.message} style={{ marginBottom: 16 }} />}

      <Card className="surface-card duty-board" styles={{ body: { padding: 0 } }}>
        <div className="duty-board-header">
          <div className="duty-board-heading">
            <div className="duty-board-title">
              <CalendarOutlined className="duty-board-title-icon" />
              <h2>一周值日安排总览</h2>
            </div>
            <p className="duty-board-subtitle">共 {groups.length} 个值日小组，覆盖周一至周五的日常清洁任务。</p>
          </div>
          <div className="duty-board-legend" aria-label="值日安排图例">
            <span className="duty-board-legend-item"><span className="duty-board-swatch duty-board-swatch-standard" />常规任务</span>
            <span className="duty-board-legend-item"><span className="duty-board-swatch duty-board-swatch-review" />重点复查</span>
          </div>
        </div>

        <div className="duty-table-wrap">
          <table className="duty-table">
            <caption className="sr-only">周一至周五班级值日安排</caption>
            <thead>
              <tr>
                <th scope="col">值日日期</th>
                <th scope="col">负责区域</th>
                <th scope="col">值日成员</th>
                <th scope="col">清洁提醒</th>
                <th scope="col" className="duty-actions-column">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td className="duty-table-state" colSpan={5}><Spin size="small" description="正在加载值日安排" /></td>
                </tr>
              )}
              {!loading && groups.length === 0 && (
                <tr>
                  <td className="duty-table-state" colSpan={5}><Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂未安排值日小组" /></td>
                </tr>
              )}
              {!loading && groups.map((group) => {
                const isToday = group.weekday === todayWeekday;
                return (
                  <tr className={isToday ? "duty-row duty-row-today" : "duty-row"} key={group.id}>
                    <th scope="row" className="duty-date-cell">
                      <span className="duty-day-number">{group.weekday}</span>
                      <span className="duty-date-copy">
                        <strong>{weekdays[group.weekday - 1]}</strong>
                        <small>{group.name}{isToday ? " · 今日" : ""}</small>
                      </span>
                    </th>
                    <td>
                      <div className="duty-area">
                        <span className="duty-cell-icon"><EnvironmentOutlined /></span>
                        <span>{group.area}</span>
                      </div>
                    </td>
                    <td>
                      <div className="duty-members">
                        {group.assignments.length > 0 ? group.assignments.map((item) => (
                          <Tag className="duty-member-tag" color={isToday ? "blue" : undefined} key={item.student.id}>{item.student.name}</Tag>
                        )) : <span className="muted">待分配成员</span>}
                      </div>
                    </td>
                    <td>
                      <div className={group.notes ? "duty-note" : "duty-note duty-note-default"}>
                        <ClockCircleOutlined />
                        <span>{group.notes ?? "按常规要求完成值日"}</span>
                      </div>
                    </td>
                    <td className="duty-actions-cell">
                      <Space className="duty-actions" size={2}>
                        <Tooltip title="编辑安排">
                          <Button type="text" aria-label={`编辑${group.name}`} icon={<EditOutlined />} onClick={() => openEditor(group)} />
                        </Tooltip>
                        <Popconfirm title="删除这个值日小组？" okText="删除" cancelText="取消" onConfirm={() => void deleteGroup(group.id)}>
                          <Tooltip title="删除安排">
                            <Button type="text" danger aria-label={`删除${group.name}`} icon={<DeleteOutlined />} />
                          </Tooltip>
                        </Popconfirm>
                      </Space>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="duty-board-footer">
          <InfoCircleOutlined />
          <span>若遇特殊情况不能值日，请提前向组长或班主任请假并安排换班。</span>
        </div>
      </Card>

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
            <Col xs={24} sm={12}><Form.Item name="name" label="小组名称" rules={[{ required: true, message: "请输入小组名称" }]}><Input placeholder="如：第一组" /></Form.Item></Col>
            <Col xs={24} sm={12}><Form.Item name="weekday" label="值日日期" rules={[{ required: true, message: "请选择值日日期" }]}><Select options={weekdays.map((label, index) => ({ value: index + 1, label }))} /></Form.Item></Col>
          </Row>
          <Form.Item name="area" label="负责区域" rules={[{ required: true, message: "请输入负责区域" }]}><Input placeholder="教室、走廊、卫生区" /></Form.Item>
          <Form.Item name="studentIds" label="成员"><Select mode="multiple" optionFilterProp="label" placeholder="选择值日成员" options={(data?.students ?? []).map((student) => ({ value: student.id, label: `${student.name} · ${student.studentNo}` }))} /></Form.Item>
          <Form.Item name="notes" label="提醒"><Input.TextArea rows={2} placeholder="如：早读前完成" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
