"use client";

import {
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  TeamOutlined,
  BookOutlined,
  ScheduleOutlined,
} from "@ant-design/icons";
import { Alert, Empty, Skeleton, Timeline } from "antd";
import dayjs from "dayjs";

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
  HIGH: "#be123c",
  MEDIUM: "#b45309",
  LOW: "#015186",
} as const;

export default function DashboardPage() {
  const { data, loading, error } = useApiData<DashboardData>("/api/dashboard");
  const dateLabel = dayjs().format("M 月 D 日 dddd");

  return (
    <div className="unified-dashboard-sheet">
      {error && <Alert type="error" showIcon title={error.message} style={{ marginBottom: 20 }} />}

      {loading || !data ? (
        <div style={{ padding: 40 }}>
          <Skeleton active paragraph={{ rows: 14 }} />
        </div>
      ) : (
        <>
          {/* 顶栏学术公报标头：坐标、日期、问候与 KPI 刻度 */}
          <header className="sheet-header">
            <div className="sheet-header-main">
              <div className="sheet-tag-strip">
                <span className="sheet-vol-tag font-mono">VOL. 2026 // DOSSIER</span>
                <span className="sheet-campus-tag font-mono">ACADEMIC LEDGER · {data.classInfo.grade} {data.classInfo.name}</span>
              </div>
              <h1 className="sheet-title">早上好，{data.classInfo.teacher ?? "系统管理员"}</h1>
              <p className="sheet-subtitle">{dateLabel} · 今日教学与班级运行概览</p>
            </div>

            {/* KPI 指标双联刻度 */}
            <div className="sheet-header-metrics">
              <div className="metric-strip-item">
                <div className="metric-strip-head">
                  <span className="metric-strip-label font-mono">REGISTRY // 班级在册</span>
                  <TeamOutlined className="metric-strip-icon" />
                </div>
                <div className="metric-strip-num">
                  {data.summary.studentCount}<small>人</small>
                </div>
                <span className="metric-strip-foot">{data.summary.maleCount} 男 · {data.summary.femaleCount} 女</span>
              </div>

              <div className="metric-strip-divider" />

              <div className="metric-strip-item">
                <div className="metric-strip-head">
                  <span className="metric-strip-label font-mono">AUDIT // 待办事项</span>
                  <CheckCircleOutlined className="metric-strip-icon" />
                </div>
                <div className="metric-strip-num">
                  {data.summary.todoCount}<small>项</small>
                </div>
                <span className="metric-strip-foot">需近期归档处理</span>
              </div>
            </div>
          </header>

          {/* 核心主运行矩阵（左侧待办提醒 + 右侧今日课表，精密墨线垂直贯通） */}
          <div className="sheet-body-matrix">
            {/* 左半区：重要提醒事项 */}
            <section className="sheet-pane-left">
              <div className="pane-title-strip">
                <span className="pane-title">
                  <ClockCircleOutlined /> 重要提醒事项
                </span>
                <span className="pane-count font-mono">共 {data.workItems.length} 项记录</span>
              </div>

              <div className="pane-content-wrap">
                {data.workItems.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今日无紧急待办事项" />
                ) : (
                  data.workItems.map((item) => (
                    <div className={`ledger-task-row task-${item.priority.toLowerCase()}`} key={item.id}>
                      <span className="task-dot" style={{ background: priorityColor[item.priority] }} />
                      <div className="task-body">
                        <strong className="task-title">{item.title}</strong>
                        <span className="task-due font-mono">
                          {item.dueAt ? `${dayjs(item.dueAt).format("M 月 D 日 HH:mm")} 截止` : "无截止时限"}
                        </span>
                      </div>
                      <span className={`task-badge badge-${item.priority.toLowerCase()} font-mono`}>
                        {item.priority === "HIGH" ? "紧急" : item.priority === "MEDIUM" ? "常规" : "稍后"}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* 右半区：今日课程时间线 */}
            <section className="sheet-pane-right">
              <div className="pane-title-strip">
                <span className="pane-title">
                  <CalendarOutlined /> 今日课程编排
                </span>
                <span className="pane-count font-mono">{data.today.courses.length} 节课时</span>
              </div>

              <div className="pane-content-wrap">
                {data.today.courses.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="今天未排定教学课程" />
                ) : (
                  <Timeline
                    className="ledger-timeline"
                    items={data.today.courses.map((entry) => ({
                      color: entry.course.color || "#015186",
                      content: (
                        <div className="timeline-course-box">
                          <div>
                            <strong className="course-name">第 {entry.period} 节 · {entry.course.name}</strong>
                            <div className="course-location font-mono">
                              {entry.teacherName ?? "任课待定"} · {entry.room ?? "教室待定"}
                            </div>
                          </div>
                          <span className="course-period-tag font-mono">P.{entry.period}</span>
                        </div>
                      ),
                    }))}
                  />
                )}
              </div>
            </section>
          </div>

          {/* 底部公报栏：值日安排与考试存档双栏并列 */}
          <footer className="sheet-footer-strip">
            <div className="footer-col">
              <div className="footer-col-head font-mono">
                <ScheduleOutlined /> 今日值日执行 // CHORES
              </div>
              <div className="footer-col-body">
                {data.today.dutyGroups.length === 0 ? (
                  <span className="empty-subtext">今天无排定值日记录</span>
                ) : (
                  data.today.dutyGroups.map((group) => (
                    <div className="footer-entry-row" key={group.id}>
                      <span className="footer-entry-badge font-mono">{group.name}</span>
                      <strong className="footer-entry-area">{group.area}</strong>
                      <span className="footer-entry-students">
                        {group.assignments.map((item) => item.student.name).join("、")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="sheet-col-divider" />

            <div className="footer-col">
              <div className="footer-col-head font-mono">
                <BookOutlined /> 最近考试存档 // ARCHIVES
              </div>
              <div className="footer-col-body">
                {data.recentExams.length === 0 ? (
                  <span className="empty-subtext">暂无近期测验与考卷归档</span>
                ) : (
                  data.recentExams.map((exam) => (
                    <div className="footer-entry-row" key={exam.id}>
                      <strong className="footer-exam-title">{exam.name}</strong>
                      <span className="footer-exam-date font-mono">
                        {dayjs(exam.examDate).format("YYYY 年 M 月 D 日")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </footer>

          {/* 出版物典雅文尾版权印记 (Colophon Stamp) */}
          <div className="sheet-colophon-bar">
            <span>QUE-WO-BU-ZHUAN // ACADEMIC OPERATING SYSTEM</span>
            <span>SEC. A-01 · DIGITALLY CERTIFIED BY SIS ENGINE</span>
            <span>ALL RIGHTS RESERVED // MMXXVI</span>
          </div>
        </>
      )}
    </div>
  );
}
