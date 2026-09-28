"use client";

import { FileExcelOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, App, Button, Modal, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type {
  SeatingImportDraft,
  SeatingImportIssue,
  SeatingImportMatch,
  SeatingImportStats,
} from "@/domain/seating-import";
import type { SeatingRuleCandidate } from "@/domain/seating-rule-inference";
import { apiRequest } from "@/lib/api";

const { Text } = Typography;

export interface SeatingImportResponse {
  fileName: string;
  sourceType: "CSV" | "XLSX";
  draft: SeatingImportDraft;
  matches: SeatingImportMatch[];
  issues: SeatingImportIssue[];
  stats: SeatingImportStats;
}

interface SeatingRuleInferenceResponse {
  snapshotCount: number;
  candidates: SeatingRuleCandidate[];
}

export interface SeatingImportModalProps {
  open: boolean;
  onCancel: () => void;
  onApply: (draft: SeatingImportDraft) => void;
}

function statLabel(stats: SeatingImportStats) {
  return [
    <Tag color="green" key="matched">已匹配 {stats.matched}</Tag>,
    <Tag color={stats.unmatched > 0 ? "red" : "default"} key="unmatched">未匹配 {stats.unmatched}</Tag>,
    <Tag color={stats.duplicate > 0 ? "orange" : "default"} key="duplicate">重复 {stats.duplicate}</Tag>,
    <Tag key="empty">空座 {stats.empty}</Tag>,
  ];
}

function issueText(issue: SeatingImportIssue) {
  const position = issue.row && issue.column ? `第 ${issue.row} 排第 ${issue.column} 座：` : "";
  return `${position}${issue.message}`;
}

export function SeatingImportModal({ open, onCancel, onApply }: SeatingImportModalProps) {
  const { message } = App.useApp();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<SeatingImportResponse | null>(null);
  const [ruleCandidates, setRuleCandidates] = useState<SeatingRuleInferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [inferLoading, setInferLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      setResult(null);
      setRuleCandidates(null);
      setLoading(false);
      setInferLoading(false);
    }
  }, [open]);

  async function handlePreview() {
    if (!selectedFile) {
      message.warning("请选择 CSV 或 Excel 文件");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("fileName", selectedFile.name);
      const response = await apiRequest<SeatingImportResponse>("/api/seating/imports", {
        method: "POST",
        body: formData,
      });
      setResult(response);
      setRuleCandidates(null);
    } catch (error) {
      message.error((error as Error).message || "读取座位文件失败");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleInferRules() {
    setInferLoading(true);
    try {
      const response = await apiRequest<SeatingRuleInferenceResponse>("/api/seating/imports/infer", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRuleCandidates(response);
    } catch (error) {
      message.error((error as Error).message || "历史规律分析失败");
    } finally {
      setInferLoading(false);
    }
  }

  function handleApply() {
    if (!result) return;
    if (result.issues.length > 0) {
      message.warning("请先处理导入冲突，再载入编辑画布");
      return;
    }
    onApply(result.draft);
    message.success(`已识别 ${result.draft.assignments.length} 个座位，载入编辑画布后请保存`);
    onCancel();
  }

  const previewMatches = result?.matches.slice(0, 12) ?? [];
  const hasBlockingIssues = Boolean(result?.issues.length);

  return (
    <Modal
      title={(
        <Space>
          <FileExcelOutlined style={{ color: "var(--primary)" }} />
          <span>导入座位图</span>
        </Space>
      )}
      open={open}
      onCancel={onCancel}
      width={720}
      centered
      destroyOnHidden
      footer={(
        <Space>
          <Button onClick={onCancel}>取消</Button>
          <Button type="primary" disabled={!result || hasBlockingIssues} onClick={handleApply}>
            载入编辑画布
          </Button>
        </Space>
      )}
    >
      <div style={{ display: "grid", gap: 16 }}>
        <label
          htmlFor="seating-import-file"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            padding: 16,
            border: "1px dashed var(--border-color, #d9e2ec)",
            borderRadius: 8,
          }}
        >
          <span>
            <strong>选择座位文件</strong>
            <br />
            <Text type="secondary">支持 CSV、XLSX、XLS，单文件不超过 5 MB</Text>
          </span>
          <Button icon={<UploadOutlined />} loading={loading}>
            {selectedFile ? "重新选择" : "选择文件"}
          </Button>
          <input
            id="seating-import-file"
            type="file"
            accept=".csv,.tsv,.xlsx,.xls"
            hidden
            onChange={(event) => {
              setSelectedFile(event.currentTarget.files?.[0] ?? null);
              setResult(null);
            }}
          />
        </label>

        {selectedFile && (
          <Space style={{ justifyContent: "space-between" }}>
            <Text>已选择：{selectedFile.name}</Text>
            <Button type="primary" loading={loading} onClick={() => void handlePreview()}>
              识别并预览
            </Button>
          </Space>
        )}

        {result && (
          <div style={{ display: "grid", gap: 12 }}>
            <Alert
              type={hasBlockingIssues ? "warning" : "success"}
              showIcon
              title={hasBlockingIssues ? "识别完成，请处理冲突" : "识别完成，可以载入编辑画布"}
              description={`${result.draft.rows} 排 × ${result.draft.columns} 列 · 方向：${result.draft.orientation === "UNKNOWN" ? "待确认" : result.draft.orientation === "FRONT_BOTTOM" ? "讲台在下方" : "讲台在上方"}`}
            />
            <Space wrap>{statLabel(result.stats)}</Space>

            <Space wrap>
              <Button loading={inferLoading} onClick={() => void handleInferRules()}>
                分析历史规律
              </Button>
              {ruleCandidates && (
                <Text type="secondary">
                  已分析 {ruleCandidates.snapshotCount} 张历史快照
                </Text>
              )}
            </Space>

            {ruleCandidates && ruleCandidates.candidates.length > 0 && (
              <div style={{ display: "grid", gap: 8 }}>
                <Text strong>规律候选</Text>
                {ruleCandidates.candidates.slice(0, 3).map((candidate) => (
                  <div
                    key={candidate.ruleId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      padding: "8px 10px",
                      border: "1px solid var(--border-color, #d9e2ec)",
                      borderRadius: 6,
                    }}
                  >
                    <span>
                      <strong>{candidate.name}</strong>
                      <br />
                      <Text type="secondary">{candidate.matchedTransitions}/{candidate.comparableTransitions} 个位置符合</Text>
                    </span>
                    <Tag color={candidate.confidence >= 0.85 ? "green" : candidate.confidence >= 0.8 ? "gold" : "default"}>
                      {Math.round(candidate.confidence * 100)}%
                    </Tag>
                  </div>
                ))}
              </div>
            )}
            {ruleCandidates && ruleCandidates.candidates.length === 0 && (
              <Alert type="info" showIcon title="暂未发现稳定规律" description="至少需要两张可比较的历史座次快照。" />
            )}

            {result.issues.length > 0 && (
              <Alert
                type="error"
                showIcon
                message={`有 ${result.issues.length} 项需要处理`}
                description={(
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {result.issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`}>{issueText(issue)}</li>)}
                    {result.issues.length > 8 && <li>其余冲突请在原文件修正后重新导入</li>}
                  </ul>
                )}
              />
            )}

            {previewMatches.length > 0 && (
              <div>
                <Text strong>识别记录（最多显示 12 条）</Text>
                <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
                  {previewMatches.map((match) => (
                    <Text key={`${match.row}-${match.column}-${match.sourceText}`} type={match.status === "EXACT" ? undefined : "danger"}>
                      第 {match.row} 排第 {match.column} 座 · {match.sourceText} · {match.status === "EXACT" ? "已匹配" : match.status === "DUPLICATE" ? "重复" : "未匹配"}
                    </Text>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
