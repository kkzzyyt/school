"use client";

import { FileExcelOutlined, UploadOutlined } from "@ant-design/icons";
import { Alert, App, Button, Checkbox, Modal, Select, Space, Tag, Typography } from "antd";
import { useEffect, useState } from "react";

import type {
  SeatingImportDraft,
  SeatingImportIssue,
  SeatingImportMatch,
  SeatingImportStats,
  SeatingImportStudent,
} from "@/domain/seating-import";
import { reviseSeatingImportPreview } from "@/domain/seating-import";
import type { SeatingRuleCandidate } from "@/domain/seating-rule-inference";
import { apiRequest } from "@/lib/api";

const { Text } = Typography;

export interface SeatingImportResponse {
  fileName: string;
  sourceType: "CSV" | "XLSX" | "IMAGE";
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
  students: readonly SeatingImportStudent[];
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

export function SeatingImportModal({ open, onCancel, onApply, students }: SeatingImportModalProps) {
  const { message } = App.useApp();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<SeatingImportResponse | null>(null);
  const [ruleCandidates, setRuleCandidates] = useState<SeatingRuleInferenceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [inferLoading, setInferLoading] = useState(false);
  const [corrections, setCorrections] = useState<Map<number, string | null>>(new Map());
  const [imageReviewed, setImageReviewed] = useState(false);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  function handleClose() {
    onCancel();
  }

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
      setCorrections(new Map());
      setImageReviewed(false);
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
    if (!result || !preview) return;
    if (blockingIssues.length > 0 || (result.sourceType === "IMAGE" && !imageReviewed)) {
      message.warning("请先处理导入冲突，再载入编辑画布");
      return;
    }
    onApply({ ...preview.draft, issues: [] });
    message.success(`已识别 ${preview.draft.assignments.length} 个座位，载入编辑画布后请保存`);
    handleClose();
  }

  const preview = result ? reviseSeatingImportPreview(result, corrections) : null;
  const blockingIssues = preview?.issues.filter((issue) => issue.code !== "LOW_OCR_CONFIDENCE") ?? [];
  const hasBlockingIssues = blockingIssues.length > 0;
  const matchOptions = [
    { label: "留空", value: "__empty__" },
    ...students.map((student) => ({ label: `${student.name}（${student.studentNo}）`, value: student.id })),
  ];

  return (
    <Modal
      title={(
        <Space>
          <FileExcelOutlined style={{ color: "var(--primary)" }} />
          <span>导入座位图</span>
        </Space>
      )}
      open={open}
      onCancel={handleClose}
      width={720}
      centered
      destroyOnHidden
      footer={(
        <Space>
          <Button onClick={handleClose}>取消</Button>
          <Button
            type="primary"
            disabled={!result || hasBlockingIssues || (result.sourceType === "IMAGE" && !imageReviewed)}
            onClick={handleApply}
          >
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
            <Text type="secondary">支持 CSV、XLSX、PNG、JPEG、WebP，单文件不超过 5 MB</Text>
          </span>
          <Button icon={<UploadOutlined />} loading={loading}>
            {selectedFile ? "重新选择" : "选择文件"}
          </Button>
          <input
            id="seating-import-file"
            type="file"
            accept=".csv,.tsv,.xlsx,.png,.jpg,.jpeg,.webp"
            hidden
            onChange={(event) => {
              const file = event.currentTarget.files?.[0] ?? null;
              setSelectedFile(file);
              setImageUrl(file?.type.startsWith("image/") && URL.createObjectURL
                ? URL.createObjectURL(file)
                : null);
              setResult(null);
              setCorrections(new Map());
              setImageReviewed(false);
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

        {imageUrl && (
          // This local blob URL is a temporary preview of the teacher's selected image.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt="待识别的座位图"
            style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 6 }}
          />
        )}

        {result && preview && (
          <div style={{ display: "grid", gap: 12 }}>
            <Alert
              type={hasBlockingIssues ? "warning" : "success"}
              showIcon
              title={hasBlockingIssues ? "识别完成，请处理冲突" : "识别完成，可以载入编辑画布"}
              description={`${preview.draft.rows} 排 × ${preview.draft.columns} 列 · 方向：${preview.draft.orientation === "UNKNOWN" ? "待确认" : preview.draft.orientation === "FRONT_BOTTOM" ? "讲台在下方" : "讲台在上方"}`}
            />
            <Space wrap>{statLabel(preview.stats)}</Space>

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

            {preview.issues.length > 0 && (
              <Alert
                type={hasBlockingIssues ? "error" : "warning"}
                showIcon
                message={`有 ${preview.issues.length} 项需要核对`}
                description={(
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {preview.issues.slice(0, 8).map((issue, index) => <li key={`${issue.code}-${index}`}>{issueText(issue)}</li>)}
                    {preview.issues.length > 8 && <li>还有 {preview.issues.length - 8} 项，请继续核对</li>}
                  </ul>
                )}
              />
            )}

            {preview.matches.length > 0 && (
              <div>
                <Text strong>识别记录与学生匹配</Text>
                <div style={{ display: "grid", gap: 8, marginTop: 8, maxHeight: 260, overflowY: "auto" }}>
                  {preview.matches.map((match, index) => (
                    <div
                      key={`${match.row}-${match.column}-${index}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                    >
                      <Text type={match.status === "UNMATCHED" || match.status === "DUPLICATE" ? "danger" : undefined}>
                        第 {match.row} 排第 {match.column} 座 · {match.sourceText}
                      </Text>
                      <Select
                        aria-label={`第 ${match.row} 排第 ${match.column} 座学生`}
                        value={match.status === "EMPTY" ? "__empty__" : match.studentId ?? undefined}
                        placeholder="选择学生"
                        style={{ minWidth: 190 }}
                        showSearch
                        optionFilterProp="label"
                        options={matchOptions}
                        onChange={(value: string) => setCorrections((current) => new Map(current).set(
                          index,
                          value === "__empty__" ? null : value,
                        ))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.sourceType === "IMAGE" && (
              <Checkbox checked={imageReviewed} onChange={(event) => setImageReviewed(event.target.checked)}>
                我已对照原图核对姓名、座位和讲台方向
              </Checkbox>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
