"use client";

import { ArrowLeftOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Input, Select, Space, Table, Tag } from "antd";
import type { TableProps } from "antd";
import Link from "next/link";
import { useMemo, useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";

import styles from "./class-roster.module.css";

type StudentStatus = "ACTIVE" | "SUSPENDED" | "TRANSFERRED" | "GRADUATED";
type StudentGender = "MALE" | "FEMALE" | "OTHER";

interface StudentSummary {
  id: string;
  studentNo: string;
  name: string;
  gender: StudentGender;
  status: StudentStatus;
}

interface ClassRosterResponse {
  classroom: {
    id: string;
    name: string;
    grade: string;
    academicYear: string;
    semester: "FIRST" | "SECOND";
    room: string | null;
    studentCount: number;
  };
  students: StudentSummary[];
}

const statusLabels: Record<StudentStatus, string> = {
  ACTIVE: "在读",
  SUSPENDED: "休学",
  TRANSFERRED: "转出",
  GRADUATED: "毕业",
};

const statusColors: Record<StudentStatus, string> = {
  ACTIVE: "green",
  SUSPENDED: "orange",
  TRANSFERRED: "default",
  GRADUATED: "blue",
};

const genderLabels: Record<StudentGender, string> = {
  MALE: "男",
  FEMALE: "女",
  OTHER: "其他",
};

export function ClassRoster({ classId }: { classId: string }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StudentStatus | "ALL">("ALL");
  const { data, loading, error, refresh } = useApiData<ClassRosterResponse>(`/api/admin/classes/${encodeURIComponent(classId)}/students`);
  const students = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return (data?.students ?? []).filter((student) => {
      const matchesStatus = statusFilter === "ALL" || student.status === statusFilter;
      const matchesQuery = !query || student.name.toLowerCase().includes(query) || student.studentNo.toLowerCase().includes(query);
      return matchesStatus && matchesQuery;
    });
  }, [data, searchQuery, statusFilter]);

  const columns: TableProps<StudentSummary>["columns"] = [
    { title: "学号", dataIndex: "studentNo", width: 180 },
    { title: "姓名", dataIndex: "name", width: 180 },
    { title: "性别", dataIndex: "gender", width: 120, render: (gender: StudentGender) => genderLabels[gender] },
    { title: "学籍状态", dataIndex: "status", width: 130, render: (status: StudentStatus) => <Tag color={statusColors[status]}>{statusLabels[status]}</Tag> },
  ];

  return (
    <div className={styles.page}>
      <PageHeading
        kicker="CLASS ROSTER"
        title={data?.classroom.name ?? "班级花名册"}
        description={data ? `${data.classroom.grade} · ${data.classroom.academicYear} · ${data.classroom.room ?? "教室未设置"}` : "查看该班级的学生基础信息。"}
        action={<Link href="/admin/classes"><Button icon={<ArrowLeftOutlined />}>返回班级管理</Button></Link>}
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

      <Card className={`surface-card ${styles.rosterCard}`}>
        <div className={styles.toolbar}>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索姓名或学号"
            aria-label="搜索姓名或学号"
            onSearch={setSearchQuery}
            onChange={(event) => { if (!event.target.value) setSearchQuery(""); }}
            style={{ maxWidth: 320 }}
          />
          <Select
            aria-label="学籍状态筛选"
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: "ALL", label: "全部状态" },
              { value: "ACTIVE", label: "在读" },
              { value: "SUSPENDED", label: "休学" },
              { value: "TRANSFERRED", label: "转出" },
              { value: "GRADUATED", label: "毕业" },
            ]}
            style={{ width: 130 }}
          />
        </div>
        <div className={styles.rosterMeta}>
          <Space><TeamOutlined /><strong>{data?.classroom.studentCount ?? "—"}</strong><span>名学生</span></Space>
          <span className="muted">仅展示学号、姓名、性别和学籍状态</span>
        </div>
        {students.length === 0 && !loading ? (
          <Empty description="暂无匹配学生" />
        ) : (
          <Table<StudentSummary>
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={students}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 620 }}
          />
        )}
      </Card>
    </div>
  );
}
