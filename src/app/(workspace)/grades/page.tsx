"use client";

import { BarChartOutlined, EditOutlined, PlusOutlined, RiseOutlined } from "@ant-design/icons";
import { Alert, App, Button, Card, Checkbox, Col, DatePicker, Empty, Form, Input, InputNumber, Modal, Row, Select, Skeleton, Space, Statistic, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import type { Dayjs } from "dayjs";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

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
    } catch (createError) { message.error((createError as Error).message); }
    finally { setSaving(false); }
  }

  function openScores() {
    if (!analysis) return;
    setScoreDraft(analysis.rankings.map((ranking) => ({ ...ranking, subjectScores: ranking.subjectScores.map((score) => ({ ...score })) })));
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
        body: JSON.stringify({ scores: scoreDraft.flatMap((student) => student.subjectScores.map((score) => ({
          examSubjectId: examSubjectBySubjectId.get(score.subjectId),
          studentId: student.studentId,
          score: score.absent ? null : score.score,
          absent: score.absent,
        }))) }),
      });
      message.success("成绩已保存，分析结果已更新");
      setScoresOpen(false);
      await loadAnalysis(activeExamId);
    } catch (scoreError) { message.error((scoreError as Error).message); }
    finally { setSaving(false); }
  }

  const rankingColumns = useMemo<TableColumnsType<Ranking>>(() => [
    { title: "排名", dataIndex: "rank", width: 75, render: (rank) => rank <= 3 ? <Tag color={rank === 1 ? "gold" : rank === 2 ? "default" : "orange"}>第 {rank} 名</Tag> : rank },
    { title: "学号", dataIndex: "studentNo", width: 120 },
    { title: "姓名", dataIndex: "studentName", width: 100, render: (value) => <strong>{value}</strong> },
    ...(analysis?.subjectStatistics.map((subject) => ({
      title: subject.name,
      width: 85,
      render: (_: unknown, ranking: Ranking) => { const score = ranking.subjectScores.find((item) => item.subjectId === subject.subjectId); return score?.absent ? <Tag color="red">缺考</Tag> : score?.score ?? "—"; },
    })) ?? []),
    { title: "总分", dataIndex: "total", fixed: "right", width: 90, render: (value) => <strong style={{ color: "#0b57d0" }}>{value}</strong> },
  ], [analysis]);

  const scoreColumns = useMemo<TableColumnsType<Ranking>>(() => [
    { title: "学生", dataIndex: "studentName", fixed: "left", width: 95 },
    ...(analysis?.subjectStatistics.map((subject) => ({
      title: subject.name,
      width: 150,
      render: (_: unknown, ranking: Ranking) => {
        const score = ranking.subjectScores.find((item) => item.subjectId === subject.subjectId)!;
        return <Space size={5}><InputNumber min={0} max={subject.maxScore} value={score.score} disabled={score.absent} style={{ width: 82 }} onChange={(value) => changeScore(ranking.studentId, subject.subjectId, { score: value })} /><Checkbox checked={score.absent} onChange={(event) => changeScore(ranking.studentId, subject.subjectId, { absent: event.target.checked, score: event.target.checked ? null : score.score })}>缺</Checkbox></Space>;
      },
    })) ?? []),
  ], [analysis]);

  return (
    <>
      <PageHeading kicker="ACADEMIC INSIGHTS" title={analysis ? `${analysis.exam.name}分析` : "成绩分析"} description="全科成绩综合分析报告，快速定位需要关注的学习变化。" action={<Space><Button icon={<PlusOutlined />} onClick={() => { examForm.setFieldsValue({ subjectIds: examsData?.subjects.map((item) => item.id) ?? [] }); setCreateOpen(true); }}>新建考试</Button><Button type="primary" icon={<EditOutlined />} disabled={!analysis} onClick={openScores}>录入成绩</Button></Space>} />
      {(examsError || analysisError) && <Alert type="error" showIcon title={examsError?.message ?? analysisError} style={{ marginBottom: 16 }} />}
      <Card className="surface-card" style={{ marginBottom: 18 }}>
        <Space wrap><span className="muted">选择考试</span><Select loading={examsLoading} value={activeExamId} onChange={setSelectedExamId} style={{ minWidth: 240 }} options={(examsData?.exams ?? []).map((exam) => ({ value: exam.id, label: exam.name }))} />{analysis && <Tag color={analysis.exam.status === "PUBLISHED" ? "green" : "orange"}>{analysis.exam.status === "PUBLISHED" ? "已发布" : "草稿"}</Tag>}</Space>
      </Card>

      {analysisLoading ? <Skeleton active paragraph={{ rows: 14 }} /> : !analysis ? <Empty description="暂无考试数据" /> : <>
        <Row gutter={[16, 16]}>
          <Col xs={12} lg={6}><Card className="surface-card"><Statistic title="参考学生" value={analysis.overview.studentCount} suffix="人" prefix={<BarChartOutlined />} /></Card></Col>
          <Col xs={12} lg={6}><Card className="surface-card"><Statistic title="考试科目" value={analysis.overview.subjectCount} suffix="科" /></Card></Col>
          <Col xs={12} lg={6}><Card className="surface-card"><Statistic title="总分均值" value={analysis.overview.totalAverage ?? "—"} precision={2} prefix={<RiseOutlined />} /></Card></Col>
          <Col xs={12} lg={6}><Card className="surface-card"><Statistic title="成绩录入率" value={analysis.overview.scoreCoverage} suffix="%" precision={1} /></Card></Col>
        </Row>
        <Row gutter={[18, 18]} style={{ marginTop: 18 }}>
          <Col xs={24} xl={14}>
            <Card className="surface-card" title="各科平均分与及格率">
              <div style={{ width: "100%", height: 310 }}><ResponsiveContainer><BarChart data={analysis.subjectStatistics}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e8ef" /><XAxis dataKey="name" axisLine={false} tickLine={false} /><YAxis axisLine={false} tickLine={false} /><Tooltip /><Bar dataKey="average" name="平均分" fill="#0b57d0" radius={[7, 7, 0, 0]} isAnimationActive={false} /><Bar dataKey="passRate" name="及格率%" fill="#0f9d76" radius={[7, 7, 0, 0]} isAnimationActive={false} /></BarChart></ResponsiveContainer></div>
            </Card>
          </Col>
          <Col xs={24} xl={10}>
            <Card className="surface-card" title="科目概览">
              <Table rowKey="id" size="small" pagination={false} dataSource={analysis.subjectStatistics} columns={[{ title: "科目", dataIndex: "name", render: (value) => <strong>{value}</strong> }, { title: "均分", dataIndex: "average" }, { title: "最高", dataIndex: "highest" }, { title: "及格率", dataIndex: "passRate", render: (value) => value === null ? "—" : `${value}%` }]} />
            </Card>
          </Col>
        </Row>
        <Card className="surface-card" title="学生总分排名" style={{ marginTop: 18 }}>
          <Table rowKey="studentId" columns={rankingColumns} dataSource={analysis.rankings} pagination={{ pageSize: 10, showSizeChanger: false }} scroll={{ x: 760 }} />
        </Card>
      </>}

      <Modal title="新建考试" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => void createExam()} confirmLoading={saving} okText="创建考试" destroyOnHidden>
        <Form form={examForm} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="name" label="考试名称" rules={[{ required: true, message: "请输入考试名称" }]}><Input placeholder="如：第一学期期末考试" /></Form.Item>
          <Form.Item name="examDate" label="考试日期" rules={[{ required: true, message: "请选择日期" }]}><DatePicker style={{ width: "100%" }} /></Form.Item>
          <Form.Item name="subjectIds" label="考试科目" rules={[{ required: true, message: "请选择科目" }]}><Checkbox.Group options={(examsData?.subjects ?? []).map((subject) => ({ value: subject.id, label: subject.name }))} /></Form.Item>
          <Alert type="info" showIcon title="首版默认各科满分 100 分、及格线 60 分，可在后续版本中细化。" />
        </Form>
      </Modal>

      <Modal title={`批量录入 · ${analysis?.exam.name ?? ""}`} open={scoresOpen} onCancel={() => setScoresOpen(false)} onOk={() => void saveScores()} confirmLoading={saving} okText="保存全部成绩" width="min(1200px, 94vw)" destroyOnHidden>
        <div style={{ marginTop: 18 }}><Table rowKey="studentId" size="small" columns={scoreColumns} dataSource={scoreDraft} pagination={false} scroll={{ x: 900, y: 480 }} /></div>
      </Modal>
    </>
  );
}
