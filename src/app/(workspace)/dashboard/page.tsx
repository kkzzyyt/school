"use client";

import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { Alert, Card, Col, Empty, Row, Skeleton, Space, Tag, Timeline } from "antd";
import dayjs from "dayjs";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";

interface DashboardData {
  classInfo: { name: string; grade: string; room: string | null; teacher: string };
  summary: { studentCount: number; maleCount: number; femaleCount: number; todoCount: number };
  today: {
    weekday: number;
    courses: Array<{ id: string; period: number; teacherName: string | null; room: string | null; course: { name: string; color: string } }>;
    dutyGroups: Array<{ id: string; name: string; area: string; assignments: Array<{ student: { id: string; name: string } }> }>;
  };
  workItems: Array<{ id: string; title: string; priority: "LOW" | "MEDIUM" | "HIGH"; dueAt: string | null }>;
  recentExams: Array<{ id: string; name: string; examDate: string }>;
}

const priorityColor = {
  HIGH: "#c5221f",
  MEDIUM: "#d97706",
  LOW: "#0b57d0",
} as const;

export default function DashboardPage() {
  const { data, loading, error } = useApiData<DashboardData>("/api/dashboard");
  const dateLabel = dayjs().format("M 月 D 日 dddd");

  return (
    <>
      <PageHeading
        title={`早上好，${data?.classInfo.teacher ?? "老师"}`}
        description={`${dateLabel}，这是班级今天的工作概览。`}
      />
      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 18 }} />}

      {loading || !data ? (
        <Skeleton active paragraph={{ rows: 12 }} />
      ) : (
        <>
          <div className="dashboard-summary-grid">
            <Card
              className="surface-card dashboard-reminders"
              title={<Space><ClockCircleOutlined />重要提醒</Space>}
              extra={<span className="muted">共 {data.workItems.length} 项</span>}
            >
              {data.workItems.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天没有待办事项" />
              ) : (
                data.workItems.slice(0, 4).map((item) => (
                  <div className={`reminder-item reminder-${item.priority.toLowerCase()}`} key={item.id}>
                    <span className="reminder-dot" style={{ background: priorityColor[item.priority] }} />
                    <div className="reminder-copy">
                      <strong>{item.title}</strong>
                      <span>{item.dueAt ? `${dayjs(item.dueAt).format("M 月 D 日 HH:mm")} 截止` : "无截止时间"}</span>
                    </div>
                    <Tag color={item.priority === "HIGH" ? "red" : item.priority === "MEDIUM" ? "orange" : "blue"}>
                      {item.priority === "HIGH" ? "紧急" : item.priority === "MEDIUM" ? "常规" : "稍后"}
                    </Tag>
                  </div>
                ))
              )}
            </Card>

            <div className="dashboard-side-stats">
              <Card className="surface-card dashboard-metric">
                <div className="metric-icon"><TeamOutlined /></div>
                <span className="stat-label">班级人数</span>
                <div className="stat-value">{data.summary.studentCount}<small> 人</small></div>
                <span className="muted">{data.summary.maleCount} 名男生 · {data.summary.femaleCount} 名女生</span>
              </Card>
              <Card className="surface-card dashboard-metric">
                <div className="metric-icon metric-warning"><CheckCircleOutlined /></div>
                <span className="stat-label">待办事项</span>
                <div className="stat-value">{data.summary.todoCount}<small> 项</small></div>
                <span className="muted">需要在近期处理</span>
              </Card>
            </div>
          </div>

          <Card
            className="surface-card dashboard-schedule"
            title={<Space><CalendarOutlined />今日课程</Space>}
          >
            {data.today.courses.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天没有课程安排" />
            ) : (
              <Timeline
                items={data.today.courses.map((entry) => ({
                  color: entry.course.color,
                  content: (
                    <div className="course-timeline-item">
                      <div>
                        <strong>第 {entry.period} 节 · {entry.course.name}</strong>
                        <div className="muted">{entry.teacherName ?? "教师待定"} · {entry.room ?? "教室待定"}</div>
                      </div>
                      <Tag color={entry.course.color}>第 {entry.period} 节</Tag>
                    </div>
                  ),
                }))}
              />
            )}
          </Card>

          <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
            <Col xs={24} lg={12}>
              <Card className="surface-card" title="今日值日">
                {data.today.dutyGroups.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天没有值日安排" />
                ) : (
                  data.today.dutyGroups.map((group) => (
                    <div className="dashboard-list-row" key={group.id}>
                      <div><Tag color="blue">{group.name}</Tag><strong>{group.area}</strong></div>
                      <span className="muted">{group.assignments.map((item) => item.student.name).join("、")}</span>
                    </div>
                  ))
                )}
              </Card>
            </Col>
            <Col xs={24} lg={12}>
              <Card className="surface-card" title="最近考试">
                {data.recentExams.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无考试记录" />
                ) : (
                  data.recentExams.map((exam) => (
                    <div className="dashboard-list-row" key={exam.id}>
                      <div>
                        <strong>{exam.name}</strong>
                        <span className="muted">{dayjs(exam.examDate).format("YYYY 年 M 月 D 日")}</span>
                      </div>
                    </div>
                  ))
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}
    </>
  );
}
