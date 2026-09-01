"use client";

import { SaveOutlined, SwapOutlined, UserSwitchOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, InputNumber, Select, Skeleton, Space, Tag } from "antd";
import { useMemo, useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

interface Student { id: string; name: string; studentNo: string; gender: string }
interface Assignment { studentId: string; row: number; column: number }
interface SeatingData { rows: number; columns: number; students: Student[]; assignments: Assignment[] }

export default function SeatingPage() {
  const { message } = App.useApp();
  const { data, loading, error, refresh } = useApiData<SeatingData>("/api/seating");
  const [rows, setRows] = useState(6);
  const [columns, setColumns] = useState(8);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [sourceData, setSourceData] = useState<SeatingData | null>(null);
  const [saving, setSaving] = useState(false);

  if (data && data !== sourceData) {
    setSourceData(data);
    setRows(data.rows);
    setColumns(data.columns);
    setAssignments(data.assignments);
  }

  const studentById = useMemo(() => new Map(data?.students.map((student) => [student.id, student]) ?? []), [data]);
  const assignedCount = assignments.filter((item) => item.row <= rows && item.column <= columns).length;

  function changeSeat(row: number, column: number, studentId?: string) {
    setAssignments((current) => {
      const withoutPositionOrStudent = current.filter(
        (item) => !(item.row === row && item.column === column) && item.studentId !== studentId,
      );
      return studentId ? [...withoutPositionOrStudent, { studentId, row, column }] : withoutPositionOrStudent;
    });
  }

  async function saveLayout() {
    setSaving(true);
    try {
      const visibleAssignments = assignments.filter((item) => item.row <= rows && item.column <= columns);
      await apiRequest("/api/seating", { method: "PUT", body: JSON.stringify({ rows, columns, assignments: visibleAssignments }) });
      message.success("座次表已保存");
      await refresh();
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeading kicker="SEATING PLAN" title="班级座次表" description="以面向讲台的视角安排座位，系统会自动阻止重复分配。" action={<Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void saveLayout()}>保存座次</Button>} />
      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 16 }} />}
      <Card className="surface-card" styles={{ body: { padding: 24 } }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
          <Space wrap>
            <span className="muted">座位规格</span>
            <InputNumber min={1} max={12} value={rows} onChange={(value) => setRows(value ?? 1)} suffix="排" />
            <InputNumber min={1} max={12} value={columns} onChange={(value) => setColumns(value ?? 1)} suffix="列" />
          </Space>
          <Space><Tag icon={<UserSwitchOutlined />} color="green">已安排 {assignedCount} 人</Tag><Tag>未安排 {(data?.students.length ?? 0) - assignedCount} 人</Tag></Space>
        </div>
        {loading || !data ? <Skeleton active paragraph={{ rows: 12 }} /> : (
          <div style={{ overflowX: "auto", padding: "6px 4px 20px" }}>
            <div className="blackboard">讲　台</div>
            <div className="seat-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(88px, 1fr))` }}>
              {Array.from({ length: rows * columns }, (_, index) => {
                const row = Math.floor(index / columns) + 1;
                const column = (index % columns) + 1;
                const assignment = assignments.find((item) => item.row === row && item.column === column);
                const student = assignment ? studentById.get(assignment.studentId) : undefined;
                return (
                  <div className="seat-cell" key={`${row}-${column}`}>
                    <Select
                      allowClear
                      showSearch
                      variant="borderless"
                      aria-label={`${row}排${column}座学生`}
                      value={student?.id}
                      placeholder="空座"
                      optionFilterProp="label"
                      style={{ width: "100%" }}
                      options={data.students.map((item) => ({ value: item.id, label: `${item.name} · ${item.studentNo.slice(-3)}` }))}
                      onChange={(value) => changeSeat(row, column, value)}
                    />
                    <div className="seat-number">{row} 排 {column} 座 {student && <SwapOutlined style={{ float: "right" }} />}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
