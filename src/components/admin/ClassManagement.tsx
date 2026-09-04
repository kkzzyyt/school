"use client";

import { ArrowRightOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Card, Col, Empty, Input, Row, Skeleton, Statistic, Tag } from "antd";
import Link from "next/link";
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
  const summary = useMemo(() => {
    const allClasses = data?.classes ?? [];
    const students = allClasses.flatMap((classroom) => classroom.students);
    return {
      classCount: allClasses.length,
      studentCount: students.length,
      activeStudentCount: students.filter((student) => student.status === "ACTIVE").length,
    };
  }, [data]);

  return (
    <div className={styles.page}>
      <PageHeading
        kicker="CLASS MANAGEMENT"
        title="班级管理"
        description="以班级为维度查看班级概况和学生基础信息，联系方式等敏感资料不会在此展示。"
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

      <Row gutter={[16, 16]} className={styles.summaryGrid}>
        <Col xs={12} sm={8}><Card className="surface-card"><Statistic title="班级总数" value={summary.classCount} prefix={<TeamOutlined />} /></Card></Col>
        <Col xs={12} sm={8}><Card className="surface-card"><Statistic title="学生总数" value={summary.studentCount} prefix={<TeamOutlined />} /></Card></Col>
        <Col xs={24} sm={8}><Card className="surface-card"><Statistic title="在读学生" value={summary.activeStudentCount} prefix={<TeamOutlined />} styles={{ content: { color: "var(--success)" } }} /></Card></Col>
      </Row>

      <Card className={`surface-card ${styles.directoryCard}`}>
        <div className={styles.directoryHeader}>
          <div>
            <div className="page-kicker">CLASS DIRECTORY</div>
            <h2>班级目录</h2>
            <p>选择一个班级查看该班学生，并进入对应花名册。</p>
          </div>
          <Input.Search
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索班级、年级或学年"
            aria-label="搜索班级、年级或学年"
            onSearch={setSearchQuery}
            onChange={(event) => { if (!event.target.value) setSearchQuery(""); }}
            style={{ maxWidth: 320 }}
          />
        </div>

        {loading && !data ? (
          <Skeleton active paragraph={{ rows: 5 }} />
        ) : classes.length === 0 ? (
          <Empty description="暂无匹配班级" />
        ) : (
          <div className={styles.classDirectory}>
            {classes.map((classroom) => {
              const activeStudentCount = classroom.students.filter((student) => student.status === "ACTIVE").length;
              return (
                <article className={styles.classEntry} key={classroom.id}>
                  <div className={styles.classEntryHeader}>
                    <span className={styles.classEntryIcon}><TeamOutlined /></span>
                    <span className={styles.classEntryCopy}>
                      <strong>{classroom.name}</strong>
                      <span>{classroom.grade} · {classroom.academicYear}</span>
                    </span>
                    <Tag color="blue">{activeStudentCount}/{classroom.studentCount} 人</Tag>
                  </div>
                  <div className={styles.classEntryFooter}>
                    <span>{classroom.room ?? "教室未设置"}</span>
                    <Link href={`/admin/classes/${classroom.id}/students`}>查看花名册 <ArrowRightOutlined /></Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
