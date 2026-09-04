"use client";

import { ReloadOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Empty, Input, Space, Table, Tag } from "antd";
import type { TableProps } from "antd";
import { useMemo, useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";

import styles from "./classes.module.css";

type StudentStatus = "ACTIVE" | "SUSPENDED" | "TRANSFERRED" | "GRADUATED";
type StudentGender = "MALE" | "FEMALE" | "OTHER";

interface StudentSummary {
  id: string;
  studentNo: string;
  name: string;
  gender: StudentGender;
  status: StudentStatus;
}

interface ClassSummary {
  id: string;
  name: string;
  grade: string;
  academicYear: string;
  semester: "FIRST" | "SECOND";
  room: string | null;
  studentCount: number;
  students: StudentSummary[];
}

interface ClassListResponse {
  classes: ClassSummary[];
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

export function ClassManagement() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data, loading, error, refresh } = useApiData<ClassListResponse>("/api/admin/classes");
  const classes = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return data?.classes ?? [];
    return (data?.classes ?? []).filter((classroom) => (
      [classroom.name, classroom.grade, classroom.academicYear, classroom.room ?? ""]
        .some((value) => value.toLowerCase().includes(query))
    ));
  }, [data, searchQuery]);

  const studentColumns: TableProps<StudentSummary>["columns"] = [
    { title: "学号", dataIndex: "studentNo", width: 150 },
    { title: "姓名", dataIndex: "name", width: 140 },
    {
      title: "性别",
      dataIndex: "gender",
      width: 90,
      render: (gender: StudentGender) => genderLabels[gender],
    },
    {
      title: "学籍状态",
      dataIndex: "status",
      width: 110,
      render: (status: StudentStatus) => <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>,
    },
  ];

  return (
    <div className={styles.page}>
      <PageHeading
        kicker="CLASS MANAGEMENT"
        title="班级管理"
        description="查看班级概况和学生基础信息，联系方式等敏感资料不会在此展示。"
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

      <Card className={`surface-card ${styles.toolbarCard}`}>
        <Input.Search
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索班级、年级或学年"
          aria-label="搜索班级、年级或学年"
          onSearch={setSearchQuery}
          onChange={(event) => { if (!event.target.value) setSearchQuery(""); }}
          style={{ maxWidth: 360 }}
        />
      </Card>

      {classes.length === 0 && !loading ? (
        <Card className="surface-card"><Empty description="暂无匹配班级" /></Card>
      ) : (
        <div className={styles.classGrid}>
          {classes.map((classroom) => (
            <Card
              key={classroom.id}
              className={`surface-card ${styles.classCard}`}
              loading={loading}
              title={(
                <div className={styles.classTitle}>
                  <strong>{classroom.name}</strong>
                  <span className="muted">{classroom.grade} · {classroom.academicYear}</span>
                </div>
              )}
              extra={<Tag icon={<TeamOutlined />}>{classroom.studentCount} 人</Tag>}
            >
              <Space className={styles.classMeta} wrap>
                <span>教室：{classroom.room ?? "未设置"}</span>
                <span>学期：{classroom.semester === "FIRST" ? "第一学期" : "第二学期"}</span>
              </Space>
              <Table<StudentSummary>
                className={styles.studentTable}
                rowKey="id"
                size="small"
                columns={studentColumns}
                dataSource={classroom.students}
                loading={loading}
                pagination={{ pageSize: 8, hideOnSinglePage: true, showSizeChanger: false }}
                scroll={{ x: 490 }}
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
