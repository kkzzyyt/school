"use client";

import {
  BarChartOutlined,
  BookOutlined,
  CheckCircleOutlined,
  EditOutlined,
  FundOutlined,
  PlusOutlined,
  RiseOutlined,
  TeamOutlined,
  TrophyOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Checkbox,
  DatePicker,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Skeleton,
  Space,
  Table,
  Tag,
} from "antd";
import type { TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { LedgerSheet } from "@/components/layout/LedgerSheet";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

import styles from "./grades.module.css";

interface Subject { id: string; name: string }
interface Exam { id: string; name: string; examDate: string; status: string }
interface ExamsData { exams: Exam[]; subjects: Subject[] }
interface SubjectStatistic {
  id: string; subjectId: string; name: string; maxScore: number; passScore: number;
  participantCount: number; absentCount: number; average: number | null; highest: number | null; lowest: number | null; passRate: number | null;
}
interface StudentScore { subjectId: string; score: number | null; absent: boolean }
interface Ranking { studentId: string; studentName: string; studentNo?: string; total: number; rank: number; absentSubjectCount: number; subjectScores: StudentScore[] }
interface AnalysisData {
  exam: Exam; subjectStatistics: SubjectStatistic[]; rankings: Ranking[];
  overview: { studentCount: number; subjectCount: number; scoreCoverage: number; totalAverage: number | null };
}
interface ExamValues { name: string; examDate: Dayjs; subjectIds: string[] }
interface AnalysisState { examId: string; data: AnalysisData | null; error: string | null }

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}

function CustomChartTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.chartTooltipTitle}>{label}</div>
      {payload.map((entry) => (
        <div className={styles.chartTooltipRow} key={entry.name}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: entry.color }} />
            {entry.name}:
          </span>
          <span className={styles.chartTooltipValue}>
            {entry.value !== null && entry.value !== undefined ? (entry.name.includes("率") ? `${entry.value}%` : entry.value) : "—"}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function GradesPage() {
  const { message } = App.useApp();
  const { data: examsData, loading: examsLoading, error: examsError, refresh: refreshExams } = useApiData<ExamsData>("/api/exams");
  const [selectedExamId, setSelectedExamId] = useState<string>();
  const [analysisState, setAnalysisState] = useState<AnalysisState | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [scoresOpen, setScoresOpen] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<Ranking[]>([]);
  const [saving, setSaving] = useState(false);
  const [examForm] = Form.useForm<ExamValues>();
  const activeExamId = selectedExamId ?? examsData?.exams[0]?.id;
  const analysis = analysisState && analysisState.examId === activeExamId ? analysisState.data : null;
  const analysisError = analysisState && analysisState.examId === activeExamId ? analysisState.error : null;
  const analysisLoading = Boolean(activeExamId && analysisState?.examId !== activeExamId);

  const loadAnalysis = useCallback(async (examId: string) => {
    try {
      const result = await apiRequest<AnalysisData>(`/api/exams/${examId}/analysis`);
      setAnalysisState({ examId, data: result, error: null });
    } catch (requestError) {
      setAnalysisState({ examId, data: null, error: (requestError as Error).message });
    }
  }, []);

  useEffect(() => {
    if (!activeExamId) return;
    let active = true;

    async function fetchAnalysis(examId: string) {
      try {
        const result = await apiRequest<AnalysisData>(`/api/exams/${examId}/analysis`);
        if (active) setAnalysisState({ examId, data: result, error: null });
      } catch (requestError) {
        if (active) {
          setAnalysisState({
            examId,
            data: null,
            error: (requestError as Error).message,
          });
        }
      }
    }

    void fetchAnalysis(activeExamId);
    return () => { active = false; };
  }, [activeExamId]);

  async function createExam() {
    const values = await examForm.validateFields();
    setSaving(true);
    try {
      const created = await apiRequest<Exam>("/api/exams", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          examDate: values.examDate.format("YYYY-MM-DD"),
          status: "DRAFT",
          subjects: values.subjectIds.map((subjectId) => ({ subjectId, maxScore: 100, passScore: 60 })),
        }),
      });
      message.success("考试已创建，可以开始录入成绩");
      setCreateOpen(false);
      examForm.resetFields();
      await refreshExams();
      setSelectedExamId(created.id);
    } catch (createError) {
      message.error((createError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function openScores() {
    if (!analysis) return;
    setScoreDraft(analysis.rankings.map((ranking) => ({
      ...ranking,
      subjectScores: ranking.subjectScores.map((score) => ({ ...score })),
    })));
    setScoresOpen(true);
  }

  function changeScore(studentId: string, subjectId: string, patch: Partial<StudentScore>) {
    setScoreDraft((current) => current.map((student) => student.studentId !== studentId ? student : {
      ...student,
      subjectScores: student.subjectScores.map((score) => score.subjectId === subjectId ? { ...score, ...patch } : score),
    }));
  }

  async function saveScores() {
    if (!analysis || !activeExamId) return;
    setSaving(true);
    try {
      const examSubjectBySubjectId = new Map(analysis.subjectStatistics.map((subject) => [subject.subjectId, subject.id]));
      await apiRequest(`/api/exams/${activeExamId}/scores`, {
        method: "PUT",
        body: JSON.stringify({
          scores: scoreDraft.flatMap((student) => student.subjectScores.map((score) => ({
            examSubjectId: examSubjectBySubjectId.get(score.subjectId),
            studentId: student.studentId,
            score: score.absent ? null : score.score,
            absent: score.absent,
          }))),
        }),
      });
      message.success("成绩已保存，分析结果已更新");
      setScoresOpen(false);
      await loadAnalysis(activeExamId);
    } catch (scoreError) {
      message.error((scoreError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const rankingColumns = useMemo<TableColumnsType<Ranking>>(() => [
    {
      title: "排名",
      dataIndex: "rank",
      width: 80,
      render: (rank: number) => {
        if (rank === 1) return <span className={`${styles.rankBadge} ${styles.rank1}`}>🥇 1</span>;
        if (rank === 2) return <span className={`${styles.rankBadge} ${styles.rank2}`}>🥈 2</span>;
        if (rank === 3) return <span className={`${styles.rankBadge} ${styles.rank3}`}>🥉 3</span>;
        return <span className={`${styles.rankBadge} ${styles.rankOther}`}>{rank}</span>;
      },
    },
    {
      title: "学号",
      dataIndex: "studentNo",
      width: 120,
      render: (val: string) => <span className={styles.studentNoBadge}>{val || "—"}</span>,
    },
    {
      title: "姓名",
      dataIndex: "studentName",
      width: 110,
      render: (value: string) => <strong style={{ color: "var(--ink)" }}>{value}</strong>,
    },
    ...(analysis?.subjectStatistics.map((subject) => ({
      title: subject.name,
      width: 88,
      align: "center" as const,
      render: (_: unknown, ranking: Ranking) => {
        const score = ranking.subjectScores.find((item) => item.subjectId === subject.subjectId);
        if (score?.absent) return <span className={styles.absentTag}>缺考</span>;
        if (score?.score === null || score?.score === undefined) return <span style={{ color: "var(--muted)" }}>—</span>;
        const isFailed = score.score < subject.passScore;
        const isExcellent = score.score >= 90;
        return (
          <span
            className={`${styles.scoreItem} ${isFailed ? styles.scoreFailed : isExcellent ? styles.scoreExcellent : ""}`}
          >
            {score.score}
          </span>
        );
      },
    })) ?? []),
    {
      title: "总分",
      dataIndex: "total",
      fixed: "right",
      width: 95,
      align: "right",
      render: (value: number) => <span className={styles.totalScore}>{value}</span>,
    },
  ], [analysis]);

  const scoreColumns = useMemo<TableColumnsType<Ranking>>(() => [
    { title: "学生", dataIndex: "studentName", fixed: "left", width: 100 },
    ...(analysis?.subjectStatistics.map((subject) => ({
      title: subject.name,
      width: 155,
      render: (_: unknown, ranking: Ranking) => {
        const score = ranking.subjectScores.find((item) => item.subjectId === subject.subjectId)!;
        return (
          <Space size={6}>
            <InputNumber
              min={0}
              max={subject.maxScore}
              value={score.score}
              disabled={score.absent}
              style={{ width: 84 }}
              onChange={(value) => changeScore(ranking.studentId, subject.subjectId, { score: value })}
            />
            <Checkbox
              checked={score.absent}
              onChange={(event) => changeScore(ranking.studentId, subject.subjectId, {
                absent: event.target.checked,
                score: event.target.checked ? null : score.score,
              })}
            >
              缺
            </Checkbox>
          </Space>
        );
      },
    })) ?? []),
  ], [analysis]);

  return (
    <div className={styles.page}>
      <LedgerSheet
        kicker="ACADEMIC INSIGHTS"
        title={analysis ? `${analysis.exam.name}分析` : "成绩分析"}
        description="全科成绩综合统计报告、班级均分与及格率分布，快速定位各科教学与学生学习变化。"
        actions={(
          <Space wrap>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>选择考试：</span>
            <Select
              loading={examsLoading}
              value={activeExamId}
              onChange={setSelectedExamId}
              style={{ minWidth: 200 }}
              options={(examsData?.exams ?? []).map((exam) => ({ value: exam.id, label: exam.name }))}
            />
            {analysis && (
              <Tag color={analysis.exam.status === "PUBLISHED" ? "green" : "orange"} style={{ margin: 0 }}>
                {analysis.exam.status === "PUBLISHED" ? "已发布" : "草稿"}
              </Tag>
            )}
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                examForm.setFieldsValue({ subjectIds: examsData?.subjects.map((item) => item.id) ?? [] });
                setCreateOpen(true);
              }}
            >
              新建考试
            </Button>
            <Button
              type="primary"
              icon={<EditOutlined />}
              disabled={!analysis}
              onClick={openScores}
            >
              录入成绩
            </Button>
          </Space>
        )}
        metrics={[
          {
            label: "STUDENTS // 参考学生",
            value: analysis?.overview.studentCount ?? "—",
            unit: "人",
            detail: "实考在籍学生",
            icon: <TeamOutlined />,
          },
          {
            label: "SUBJECTS // 考试科目",
            value: analysis?.overview.subjectCount ?? "—",
            unit: "门",
            detail: "全科纳统分析",
            icon: <BookOutlined />,
          },
          {
            label: "AVERAGE // 总分均值",
            value: analysis?.overview.totalAverage ?? "—",
            unit: "分",
            detail: "班级平均总成绩",
            icon: <RiseOutlined />,
          },
          {
            label: "COVERAGE // 录入比例",
            value: analysis?.overview.scoreCoverage ?? "—",
            unit: "%",
            detail: analysis?.exam.status === "PUBLISHED" ? "成绩已发布" : "成绩草稿状态",
            icon: <CheckCircleOutlined />,
          },
        ]}
      >
        <div className={styles.contentWrap}>
          {(examsError || analysisError) && (
            <Alert type="error" showIcon title={examsError?.message ?? analysisError} style={{ marginBottom: 16 }} />
          )}

          {analysisLoading ? (
            <Card className="surface-card" style={{ padding: 40 }}>
              <Skeleton active paragraph={{ rows: 12 }} />
            </Card>
          ) : !analysis ? (
            <Card className="surface-card" style={{ padding: 60, textAlign: "center" }}>
              <Empty description="暂无考试数据，点击上方“新建考试”开始分析" />
            </Card>
          ) : (
            <>
              {/* 图表与科目概览 */}
              <section className={styles.chartSection}>
                <div className={styles.contentCard}>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>各科平均分与及格率对比</h3>
                    <div className={styles.cardLegend}>
                      <span><span className={styles.legendDot} style={{ background: "#015186" }} />平均分</span>
                      <span><span className={styles.legendDot} style={{ background: "#059669" }} />及格率%</span>
                    </div>
                  </div>
                  <div className={styles.cardBody}>
                    <div style={{ width: "100%", height: 320 }}>
                      <ResponsiveContainer>
                        <BarChart data={analysis.subjectStatistics} margin={{ top: 12, right: 12, left: -16, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(182, 211, 232, 0.45)" />
                          <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: "#4f6e8a", fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#4f6e8a", fontSize: 11 }} />
                          <Tooltip content={<CustomChartTooltip />} />
                          <Bar dataKey="average" name="平均分" fill="#015186" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                          <Bar dataKey="passRate" name="及格率" fill="#059669" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className={styles.contentCard}>
                  <div className={styles.cardHead}>
                    <h3 className={styles.cardTitle}>学科成绩详情</h3>
                  </div>
                  <Table
                    rowKey="id"
                    size="small"
                    pagination={false}
                    dataSource={analysis.subjectStatistics}
                    columns={[
                      { title: "科目", dataIndex: "name", render: (value: string) => <strong style={{ color: "var(--ink)" }}>{value}</strong> },
                      { title: "均分", dataIndex: "average", align: "center", render: (v: number | null) => v ?? "—" },
                      { title: "最高", dataIndex: "highest", align: "center", render: (v: number | null) => <span style={{ color: "#059669", fontWeight: 600 }}>{v ?? "—"}</span> },
                      {
                        title: "及格率",
                        dataIndex: "passRate",
                        align: "right",
                        render: (value: number | null) => value === null ? "—" : `${value}%`,
                      },
                    ]}
                  />
                </div>
              </section>

              {/* 学生总分排名表 */}
              <div className={styles.contentCard}>
                <div className={styles.cardHead}>
                  <h3 className={styles.cardTitle}>学生全科总分排名榜</h3>
                </div>
                <Table
                  rowKey="studentId"
                  columns={rankingColumns}
                  dataSource={analysis.rankings}
                  pagination={{ pageSize: 10, showSizeChanger: false }}
                  scroll={{ x: 760 }}
                />
              </div>
            </>
          )}
        </div>
      </LedgerSheet>

      {/* 新建考试弹窗 */}
      <Modal
        title="新建考试"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => void createExam()}
        confirmLoading={saving}
        okText="创建考试"
        destroyOnHidden
      >
        <Form form={examForm} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="name" label="考试名称" rules={[{ required: true, message: "请输入考试名称" }]}>
            <Input placeholder="如：第一学期期中质量调研" />
          </Form.Item>
          <Form.Item name="examDate" label="考试日期" rules={[{ required: true, message: "请选择日期" }]}>
            <DatePicker style={{ width: "100%" }} />
          </Form.Item>
          <Form.Item name="subjectIds" label="考试科目" rules={[{ required: true, message: "请选择科目" }]}>
            <Checkbox.Group options={(examsData?.subjects ?? []).map((subject) => ({ value: subject.id, label: subject.name }))} />
          </Form.Item>
          <Alert type="info" showIcon title="默认各科满分 100 分、及格线 60 分，系统将自动汇总各科成绩并计算排名。" />
        </Form>
      </Modal>

      {/* 批量录入成绩弹窗 */}
      <Modal
        title={`批量录入 · ${analysis?.exam.name ?? ""}`}
        open={scoresOpen}
        onCancel={() => setScoresOpen(false)}
        onOk={() => void saveScores()}
        confirmLoading={saving}
        okText="保存全部成绩"
        width="min(1200px, 94vw)"
        destroyOnHidden
      >
        <div style={{ marginTop: 18 }}>
          <Table rowKey="studentId" size="small" columns={scoreColumns} dataSource={scoreDraft} pagination={false} scroll={{ x: 900, y: 480 }} />
        </div>
      </Modal>
    </div>
  );
}
