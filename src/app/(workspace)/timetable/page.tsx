"use client";

import { EditOutlined, SaveOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Form, Input, Modal, Select, Skeleton, Space, Tag } from "antd";
import { useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

interface Course { id: string; name: string; color: string }
interface Entry { id?: string; courseId: string; weekday: number; period: number; teacherName: string | null; room: string | null; course: Course }
interface TimetableData { courses: Course[]; entries: Entry[] }
interface CellValues { courseId: string; teacherName?: string; room?: string }
const weekdays = ["周一", "周二", "周三", "周四", "周五"];

export default function TimetablePage() {
  const { message } = App.useApp();
  const { data, loading, error, refresh } = useApiData<TimetableData>("/api/timetable");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sourceData, setSourceData] = useState<TimetableData | null>(null);
  const [editingCell, setEditingCell] = useState<{ weekday: number; period: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm<CellValues>();

  if (data && data !== sourceData) {
    setSourceData(data);
    setEntries(data.entries);
  }

  function openCell(weekday: number, period: number) {
    const entry = entries.find((item) => item.weekday === weekday && item.period === period);
    form.resetFields();
    setEditingCell({ weekday, period });
    form.setFieldsValue(entry ? { courseId: entry.courseId, teacherName: entry.teacherName ?? undefined, room: entry.room ?? undefined } : {});
  }

  function closeCell() {
    setEditingCell(null);
    form.resetFields();
  }

  async function applyCell() {
    if (!editingCell || !data) return;
    const values = await form.validateFields();
    const course = data.courses.find((item) => item.id === values.courseId)!;
    setEntries((current) => [
      ...current.filter((item) => item.weekday !== editingCell.weekday || item.period !== editingCell.period),
      { ...editingCell, ...values, teacherName: values.teacherName ?? null, room: values.room ?? null, course },
    ]);
    closeCell();
  }

  function clearCell() {
    if (!editingCell) return;
    setEntries((current) => current.filter((item) => item.weekday !== editingCell.weekday || item.period !== editingCell.period));
    closeCell();
  }

  async function saveTimetable() {
    setSaving(true);
    try {
      await apiRequest("/api/timetable", {
        method: "PUT",
        body: JSON.stringify({
          entries: entries.map((entry) => ({
            courseId: entry.courseId,
            weekday: entry.weekday,
            period: entry.period,
            teacherName: entry.teacherName,
            room: entry.room,
          })),
        }),
      });
      message.success("课程表已保存");
      await refresh();
    } catch (saveError) { message.error((saveError as Error).message); }
    finally { setSaving(false); }
  }

  const editingEntry = editingCell
    ? entries.find((entry) => entry.weekday === editingCell.weekday && entry.period === editingCell.period)
    : undefined;

  return (
    <>
      <PageHeading kicker="WEEKLY TIMETABLE" title="班级课程安排" description="按周查看 8 节课安排，点击任意节次即可编辑课程、教师和教室。" action={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveTimetable()}>保存课表</Button>} />
      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}
      <Card className="surface-card" styles={{ body: { padding: 0 } }}>
        {loading || !data ? <div style={{ padding: 24 }}><Skeleton active paragraph={{ rows: 12 }} /></div> : (
          <div className="timetable-wrap">
            <div className="timetable-grid">
              <div className="timetable-cell timetable-head">节次</div>
              {weekdays.map((day) => <div className="timetable-cell timetable-head" key={day}>{day}</div>)}
              {Array.from({ length: 8 }, (_, periodIndex) => {
                const period = periodIndex + 1;
                return [<div className="timetable-cell timetable-head" key={`label-${period}`}>第 {period} 节</div>, ...weekdays.map((_, weekdayIndex) => {
                  const weekday = weekdayIndex + 1;
                  const entry = entries.find((item) => item.weekday === weekday && item.period === period);
                  const day = weekdays[weekdayIndex];
                  const accessibleLabel = `${day}第 ${period} 节，${entry ? `${entry.course.name}，${entry.teacherName ?? "教师待定"}，${entry.room ?? "教室待定"}` : "未安排课程"}`;
                  return <button type="button" className="timetable-cell" key={`${weekday}-${period}`} aria-label={accessibleLabel} onClick={() => openCell(weekday, period)} style={{ cursor: "pointer", textAlign: "left" }}>
                    {entry ? <div className="course-pill" style={{ "--course-color": entry.course.color } as React.CSSProperties}><div className="course-name">{entry.course.name}</div><div className="course-detail">{entry.teacherName ?? "教师待定"}</div><div className="course-detail">{entry.room ?? "教室待定"}</div></div> : <div style={{ display: "grid", height: "100%", placeItems: "center", color: "#aab3ad" }}><Space><EditOutlined />安排课程</Space></div>}
                  </button>;
                })];
              })}
            </div>
          </div>
        )}
      </Card>
      <Modal
        title={editingCell ? `${weekdays[editingCell.weekday - 1]} · 第 ${editingCell.period} 节` : "编辑课程"}
        open={Boolean(editingCell)}
        onCancel={closeCell}
        onOk={() => void applyCell()}
        okText="应用安排"
        footer={(_, { OkBtn, CancelBtn }) => (
          <div className="timetable-modal-footer">
            {editingEntry && <Button danger onClick={clearCell}>清空节次</Button>}
            <div className="timetable-modal-actions"><CancelBtn /><OkBtn /></div>
          </div>
        )}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="courseId" label="课程" rules={[{ required: true, message: "请选择课程" }]}><Select optionRender={(option) => <Space><Tag color={data?.courses.find((item) => item.id === option.value)?.color}>{option.label}</Tag></Space>} options={(data?.courses ?? []).map((course) => ({ value: course.id, label: course.name }))} /></Form.Item>
          <Form.Item name="teacherName" label="任课教师"><Input /></Form.Item>
          <Form.Item name="room" label="教室"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
