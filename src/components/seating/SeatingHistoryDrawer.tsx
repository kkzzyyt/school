"use client";

import {
  ClockCircleOutlined,
  DeleteOutlined,
  HistoryOutlined,
  RollbackOutlined,
} from "@ant-design/icons";
import {
  App,
  Button,
  Empty,
  Modal,
  Popconfirm,
  Skeleton,
  Space,
  Tag,
  Typography,
} from "antd";
import { Fragment, useEffect, useMemo, useState } from "react";

import type {
  SeatingHistoryAssignment,
  SeatingHistoryDetail,
  SeatingHistorySummary,
} from "@/domain/seating-history";
import { resolveStudentGender } from "@/domain/student-gender";
import { apiRequest } from "@/lib/api";

const { Text } = Typography;

export interface SeatingHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  onLoadDraft: (detail: SeatingHistoryDetail) => void;
  onRestoreSuccess: () => Promise<void>;
}

function studentToneClass(assignment?: SeatingHistoryAssignment) {
  if (!assignment) return "";
  const gender = resolveStudentGender(assignment.gender, assignment.studentName).value;
  if (gender === "MALE") return "seat-student-male";
  if (gender === "FEMALE") return "seat-student-female";
  return "seat-student-neutral";
}

export function SeatingHistoryDrawer({
  open,
  onClose,
  onLoadDraft,
  onRestoreSuccess,
}: SeatingHistoryDrawerProps) {
  const { message } = App.useApp();
  const [loadingList, setLoadingList] = useState(false);
  const [histories, setHistories] = useState<SeatingHistorySummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailCache, setDetailCache] = useState<Map<string, SeatingHistoryDetail>>(new Map());
  const [restoring, setRestoring] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load history list when modal opens
  useEffect(() => {
    if (!open) return;

    async function fetchList() {
      setLoadingList(true);
      try {
        const res = await apiRequest<{ histories: SeatingHistorySummary[] }>("/api/seating/history");
        const list = res.histories || [];
        setHistories(list);
        if (list.length > 0) {
          setSelectedId(list[0].id);
        } else {
          setSelectedId(null);
        }
      } catch (err) {
        message.error("获取历史记录失败：" + (err as Error).message);
      } finally {
        setLoadingList(false);
      }
    }

    void fetchList();
  }, [open, message]);

  // Load detail for selected history item
  useEffect(() => {
    if (!open || !selectedId) return;
    if (detailCache.has(selectedId)) return;

    async function fetchDetail(id: string) {
      setLoadingDetail(true);
      try {
        const detail = await apiRequest<SeatingHistoryDetail>(`/api/seating/history/${id}`);
        setDetailCache((prev) => new Map(prev).set(id, detail));
      } catch (err) {
        message.error("加载历史快照失败：" + (err as Error).message);
      } finally {
        setLoadingDetail(false);
      }
    }

    void fetchDetail(selectedId);
  }, [open, selectedId, detailCache, message]);

  const currentDetail = selectedId ? detailCache.get(selectedId) : null;

  const historySeatMap = useMemo(() => {
    const map = new Map<string, SeatingHistoryAssignment>();
    if (!currentDetail) return map;
    for (const a of currentDetail.assignments) {
      map.set(`${a.row}:${a.column}`, a);
    }
    return map;
  }, [currentDetail]);

  const aisleAfterColumns = useMemo(() => {
    return new Set(currentDetail?.environment?.aisleAfterColumns || []);
  }, [currentDetail]);

  // Order rows from back to front (highest row at top, row 1 at bottom nearest to podium)
  const orderedRows = useMemo(() => {
    if (!currentDetail) return [];
    return Array.from({ length: currentDetail.rows }, (_, rIndex) => currentDetail.rows - rIndex);
  }, [currentDetail]);

  // Mirror columns (cols down to 1) to match the canvas orientation exactly
  const orderedColumns = useMemo(() => {
    if (!currentDetail) return [];
    return Array.from({ length: currentDetail.columns }, (_, cIndex) => currentDetail.columns - cIndex);
  }, [currentDetail]);

  async function handleDirectRestore() {
    if (!selectedId) return;
    setRestoring(true);
    try {
      const res = await apiRequest<{
        restoredCount: number;
        skippedStudents: Array<{ studentId: string; studentName: string }>;
      }>(`/api/seating/history/${selectedId}/restore`, {
        method: "POST",
      });

      if (res.skippedStudents.length > 0) {
        message.warning(
          `座次已恢复，其中 ${res.skippedStudents.map((s) => s.studentName).join("、")} 已不在本班，对应座位已留空。`,
          5,
        );
      } else {
        message.success("座次已恢复成功");
      }
      onClose();
      await onRestoreSuccess();
    } catch (err) {
      message.error("恢复失败：" + (err as Error).message);
    } finally {
      setRestoring(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await apiRequest(`/api/seating/history/${id}`, {
        method: "DELETE",
      });
      message.success("历史记录已删除");
      setHistories((prev) => {
        const remaining = prev.filter((item) => item.id !== id);
        if (selectedId === id) {
          setSelectedId(remaining.length > 0 ? remaining[0].id : null);
        }
        return remaining;
      });
      setDetailCache((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    } catch (err) {
      message.error("删除失败：" + (err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  function handleApplyToCanvas() {
    if (!currentDetail) return;
    onLoadDraft(currentDetail);
    onClose();
    message.success("已载入该版本座次至编辑画布");
  }

  function formatTime(isoString: string) {
    try {
      const d = new Date(isoString);
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const h = String(d.getHours()).padStart(2, "0");
      const min = String(d.getMinutes()).padStart(2, "0");
      return `${m}-${day} ${h}:${min}`;
    } catch {
      return isoString;
    }
  }

  return (
    <Modal
      title={
        <Space size={8}>
          <HistoryOutlined style={{ color: "var(--primary)" }} />
          <span>座位调整历史</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: "normal" }}>
            (保存最近 12 次记录)
          </Text>
        </Space>
      }
      centered
      open={open}
      onCancel={onClose}
      width={880}
      footer={
        currentDetail ? (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              操作人: {currentDetail.operatorName || "教师"} · 在座 {currentDetail.assignments.length} 人 ({currentDetail.rows}排 × {currentDetail.columns}列)
            </Text>
            <Space>
              <Button onClick={handleApplyToCanvas}>
                载入画布
              </Button>
              <Popconfirm
                title="确认恢复此版本？"
                description="将直接覆盖当前生效的班级座位。"
                onConfirm={handleDirectRestore}
                okText="恢复"
                cancelText="取消"
                okButtonProps={{ loading: restoring }}
              >
                <Button type="primary" icon={<RollbackOutlined />} loading={restoring}>
                  恢复
                </Button>
              </Popconfirm>
            </Space>
          </div>
        ) : null
      }
      destroyOnClose={false}
    >
      {loadingList ? (
        <div style={{ padding: 24 }}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      ) : histories.length === 0 ? (
        <Empty
          style={{ margin: "40px 0" }}
          description="暂无历史调整记录"
        />
      ) : (
        <div style={{ display: "flex", height: 480, marginTop: 12, gap: 16 }}>
          {/* Left Column: Simple version list */}
          <div
            style={{
              width: 210,
              borderRight: "1px solid #f1f5f9",
              paddingRight: 10,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {histories.map((item, index) => {
              const isSelected = item.id === selectedId;
              const isLatest = index === 0;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedId(item.id)}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 6,
                    cursor: "pointer",
                    background: isSelected ? "#eff6ff" : "transparent",
                    border: isSelected ? "1px solid #93c5fd" : "1px solid transparent",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 500, color: isSelected ? "#1d4ed8" : "#334155" }}>
                      <ClockCircleOutlined style={{ marginRight: 5, fontSize: 12 }} />
                      {formatTime(item.createdAt)}
                    </span>
                    <Space size={4} onClick={(e) => e.stopPropagation()}>
                      {isLatest ? (
                        <Tag color="blue" style={{ margin: 0, fontSize: 10, padding: "0 4px", lineHeight: "16px" }}>
                          最新
                        </Tag>
                      ) : (
                        <Popconfirm
                          title="确认删除此记录？"
                          description="删除后不可恢复。"
                          onConfirm={(e) => {
                            e?.stopPropagation();
                            void handleDelete(item.id);
                          }}
                          okText="删除"
                          okButtonProps={{ danger: true }}
                          cancelText="取消"
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined style={{ fontSize: 11 }} />}
                            loading={deletingId === item.id}
                            onClick={(e) => e.stopPropagation()}
                            style={{
                              width: 20,
                              height: 20,
                              padding: 0,
                              color: isSelected ? "#ef4444" : "#94a3b8",
                            }}
                            title="删除此记录"
                          />
                        </Popconfirm>
                      )}
                    </Space>
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                    操作人: {item.operatorName || "教师"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right Column: Seating preview matching canvas orientation & styling */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            {loadingDetail ? (
              <Skeleton active paragraph={{ rows: 6 }} />
            ) : currentDetail ? (
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: "16px 20px",
                  background: "var(--bg-layout, #f8fafc)",
                  borderRadius: 8,
                  border: "1px solid #e2e8f0",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div
                  style={{
                    display: "inline-flex",
                    flexDirection: "column",
                    alignItems: "center",
                    minWidth: "100%",
                    gap: 16,
                    margin: "auto 0",
                  }}
                >
                  {/* Seats Grid: Row N down to Row 1; Column N down to Column 1 (mirrored like canvas) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {orderedRows.map((row) => {
                      return (
                        <div key={row} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span
                            style={{
                              width: 20,
                              fontSize: 11,
                              color: "#94a3b8",
                              textAlign: "right",
                              userSelect: "none",
                              flexShrink: 0,
                            }}
                          >
                            {row}
                          </span>
                          {orderedColumns.map((column) => {
                            const key = `${row}:${column}`;
                            const assignment = historySeatMap.get(key);
                            const isAisle = aisleAfterColumns.has(column - 1);

                            return (
                              <Fragment key={column}>
                                <div
                                  className="seat-cell seat-cell-readonly"
                                  style={{
                                    width: 62,
                                    minHeight: 38,
                                    padding: 2,
                                    background: assignment ? "rgba(255, 255, 255, 0.9)" : "rgba(240, 244, 248, 0.5)",
                                    borderStyle: assignment ? "solid" : "dashed",
                                    flexShrink: 0,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  {assignment ? (
                                    <div
                                      className={`seat-student seat-student-readonly ${studentToneClass(assignment)}`}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        minHeight: 32,
                                        padding: "2px 4px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                      title={`${assignment.studentName} (${assignment.studentNo}) · 第${row}排第${column}座`}
                                    >
                                      <span className="seat-student-copy">
                                        <strong
                                          className="seat-student-name"
                                          style={{
                                            fontSize: 12,
                                            maxWidth: 54,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                            display: "inline-block",
                                            textAlign: "center",
                                          }}
                                        >
                                          {assignment.studentName}
                                        </strong>
                                      </span>
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        height: "100%",
                                        color: "#cbd5e1",
                                        fontSize: 11,
                                      }}
                                    >
                                      -
                                    </div>
                                  )}
                                </div>

                                {/* Aisle separator */}
                                {isAisle && (
                                  <div
                                    className="seat-aisle"
                                    style={{
                                      width: 14,
                                      minWidth: 14,
                                      flexShrink: 0,
                                      display: "flex",
                                      justifyContent: "center",
                                      alignItems: "center",
                                    }}
                                    aria-hidden="true"
                                  >
                                    {row === orderedRows[0] && (
                                      <span
                                        style={{
                                          fontSize: 10,
                                          color: "#94a3b8",
                                          writingMode: "vertical-rl",
                                          transform: "scale(0.85)",
                                        }}
                                      >
                                        过道
                                      </span>
                                    )}
                                  </div>
                                )}
                              </Fragment>
                            );
                          })}
                          {/* Symmetrical right placeholder for the row number */}
                          <span style={{ width: 20, flexShrink: 0 }} aria-hidden="true" />
                        </div>
                      );
                    })}
                  </div>

                  {/* Podium at the BOTTOM, exactly centered relative to the seat grid */}
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      alignItems: "center",
                      width: "100%",
                      marginTop: 4,
                    }}
                  >
                    <div
                      className="blackboard"
                      style={{
                        width: 260,
                        maxWidth: "70%",
                        minHeight: 38,
                        padding: "4px 20px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        margin: "0 auto",
                      }}
                    >
                      <strong style={{ fontSize: 13, letterSpacing: 2 }}>讲台</strong>
                      <small style={{ fontSize: 10, opacity: 0.8 }}>BLACKBOARD</small>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Modal>
  );
}
