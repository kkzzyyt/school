"use client";

import {
  ApartmentOutlined,
  CheckOutlined,
  DeleteOutlined,
  InfoCircleOutlined,
  LockOutlined,
  PlusOutlined,
  SaveOutlined,
  SwapOutlined,
  SyncOutlined,
} from "@ant-design/icons";
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  Input,
  InputNumber,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Tag,
  Tooltip,
  message,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_ROTATION_SCHEME,
  PRESET_ROTATION_SCHEMES,
  rotateSeatAssignments,
  seatKey,
  type RotationColumnMode,
  type RotationRowDirection,
  type SeatingRotationScheme,
} from "@/domain/seating-rotation";
import type { SeatAssignment } from "@/domain/seating";

const STORAGE_KEY = "seating_custom_rotation_schemes";

interface StudentInfo {
  id: string;
  name: string;
}

export interface SeatingSchemeModalProps {
  open: boolean;
  onCancel: () => void;
  onApply: (newAssignments: SeatAssignment[]) => void;
  currentAssignments: readonly SeatAssignment[];
  rows: number;
  columns: number;
  students: readonly StudentInfo[];
  lockedSeatKeys: ReadonlySet<string>;
}

export function SeatingSchemeModal({
  open,
  onCancel,
  onApply,
  currentAssignments,
  rows,
  columns,
  students,
  lockedSeatKeys,
}: SeatingSchemeModalProps) {
  const [customSchemes, setCustomSchemes] = useState<SeatingRotationScheme[]>([]);
  const [selectedSchemeId, setSelectedSchemeId] = useState<string>(DEFAULT_ROTATION_SCHEME.id);
  const [activeScheme, setActiveScheme] = useState<SeatingRotationScheme>({ ...DEFAULT_ROTATION_SCHEME });
  const [saveNameInput, setSaveNameInput] = useState("");
  const [isSavingCustom, setIsSavingCustom] = useState(false);

  // 加载自定义方案
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomSchemes(parsed);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const allSchemes = useMemo(() => {
    return [...PRESET_ROTATION_SCHEMES, ...customSchemes];
  }, [customSchemes]);

  // 当选择方案改变时，同步更新 activeScheme
  const handleSelectScheme = (schemeId: string) => {
    setSelectedSchemeId(schemeId);
    const target = allSchemes.find((s) => s.id === schemeId);
    if (target) {
      setActiveScheme({ ...target });
    }
  };

  // 学生字典
  const studentMap = useMemo(() => {
    return new Map(students.map((s) => [s.id, s.name]));
  }, [students]);

  // 实时演算预览
  const rotationPreview = useMemo(() => {
    return rotateSeatAssignments(
      currentAssignments,
      rows,
      columns,
      activeScheme,
      lockedSeatKeys,
    );
  }, [currentAssignments, rows, columns, activeScheme, lockedSeatKeys]);

  // 原位置与新位置映射对比
  const positionDiffMap = useMemo(() => {
    const originByStudent = new Map<string, { row: number; column: number }>();
    for (const a of currentAssignments) {
      originByStudent.set(a.studentId, { row: a.row, column: a.column });
    }

    const diffs: Array<{
      studentId: string;
      name: string;
      fromRow: number;
      fromCol: number;
      toRow: number;
      toCol: number;
      isLocked: boolean;
      hasChanged: boolean;
    }> = [];

    for (const a of rotationPreview.newAssignments) {
      const origin = originByStudent.get(a.studentId);
      const isLocked = lockedSeatKeys.has(seatKey(origin?.row ?? 0, origin?.column ?? 0));
      const hasChanged = !origin || origin.row !== a.row || origin.column !== a.column;
      diffs.push({
        studentId: a.studentId,
        name: studentMap.get(a.studentId) ?? "未知",
        fromRow: origin?.row ?? a.row,
        fromCol: origin?.column ?? a.column,
        toRow: a.row,
        toCol: a.column,
        isLocked,
        hasChanged,
      });
    }

    return diffs;
  }, [currentAssignments, rotationPreview.newAssignments, lockedSeatKeys, studentMap]);

  // 保存当前设置为新自定义方案
  const handleSaveCustomScheme = () => {
    const trimmed = saveNameInput.trim();
    if (!trimmed) {
      message.warning("请输入自定义方案名称");
      return;
    }
    const newScheme: SeatingRotationScheme = {
      ...activeScheme,
      id: `custom-${Date.now()}`,
      name: trimmed,
      description: `自定义排座方案：${activeScheme.rowShift.direction === "BACKWARD" ? "后移" : "前移"}，${activeScheme.columnShift.mode}`,
      isPreset: false,
    };
    const updated = [...customSchemes, newScheme];
    setCustomSchemes(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setSelectedSchemeId(newScheme.id);
    setIsSavingCustom(false);
    setSaveNameInput("");
    message.success(`已保存方案 “${trimmed}”`);
  };

  // 删除自定义方案
  const handleDeleteCustomScheme = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = customSchemes.filter((s) => s.id !== id);
    setCustomSchemes(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    if (selectedSchemeId === id) {
      handleSelectScheme(DEFAULT_ROTATION_SCHEME.id);
    }
    message.info("已删除自定义方案");
  };

  const handleConfirmApply = () => {
    onApply(rotationPreview.newAssignments);
    message.success(`自动排座完成：已轮换 ${rotationPreview.movedCount} 名学生`);
    onCancel();
  };

  return (
    <Modal
      title={
        <Space>
          <SyncOutlined style={{ color: "var(--primary)" }} />
          <span>自动排座与轮换方案</span>
        </Space>
      }
      open={open}
      onCancel={onCancel}
      width={860}
      centered
      destroyOnHidden
      className="seating-scheme-modal"
      style={{ top: 16, paddingBottom: 16 }}
      styles={{
        body: { flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 6 },
      }}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button
          key="apply"
          type="primary"
          icon={<CheckOutlined />}
          onClick={handleConfirmApply}
        >
          应用此排座方案 ({rotationPreview.movedCount} 人移动)
        </Button>,
      ]}
    >
      <div className="seating-scheme-modal-body">
        <Row gutter={[20, 20]}>
          {/* 左侧配置面板 */}
          <Col xs={24} md={12}>
            <div className="scheme-config-panel">
              <div className="scheme-section-block">
                <div className="scheme-block-title">
                  <strong>常用与预设方案</strong>
                  <Tag color="blue">{allSchemes.length} 个可用</Tag>
                </div>
                <Select
                  style={{ width: "100%", marginTop: 6 }}
                  value={selectedSchemeId}
                  onChange={handleSelectScheme}
                  options={allSchemes.map((s) => ({
                    value: s.id,
                    label: (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span>{s.name} {s.isPreset && <Tag color="cyan" style={{ marginLeft: 6 }}>预设</Tag>}</span>
                        {!s.isPreset && (
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => handleDeleteCustomScheme(s.id, e)}
                          />
                        )}
                      </div>
                    ),
                  }))}
                />
                <p className="scheme-description-text">
                  <InfoCircleOutlined style={{ marginRight: 5 }} />
                  {activeScheme.description}
                </p>
              </div>

              <Divider style={{ margin: "14px 0" }} />

              {/* 纵向前后移动设置 */}
              <div className="scheme-section-block">
                <div className="scheme-block-title">
                  <strong>纵向规则（前后排位）</strong>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Radio.Group
                    value={activeScheme.rowShift.direction}
                    onChange={(e) =>
                      setActiveScheme({
                        ...activeScheme,
                        rowShift: { ...activeScheme.rowShift, direction: e.target.value as RotationRowDirection },
                      })
                    }
                  >
                    <Radio.Button value="BACKWARD">集体后移</Radio.Button>
                    <Radio.Button value="FORWARD">集体前移</Radio.Button>
                    <Radio.Button value="MIRROR">前后对调</Radio.Button>
                    <Radio.Button value="NONE">排数不变</Radio.Button>
                  </Radio.Group>
                </div>
                {activeScheme.rowShift.direction !== "NONE" && activeScheme.rowShift.direction !== "MIRROR" && (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>位移步长：</span>
                    <InputNumber
                      min={1}
                      max={Math.max(1, rows - 1)}
                      value={activeScheme.rowShift.step}
                      onChange={(val) =>
                        setActiveScheme({
                          ...activeScheme,
                          rowShift: { ...activeScheme.rowShift, step: val ?? 1 },
                        })
                      }
                      addonAfter="排"
                      size="small"
                      style={{ width: 110 }}
                    />
                    <span style={{ fontSize: 11, color: "var(--muted)" }}>（末排自动循环至前排）</span>
                  </div>
                )}
              </div>

              <Divider style={{ margin: "14px 0" }} />

              {/* 横向列/大组移动设置 */}
              <div className="scheme-section-block">
                <div className="scheme-block-title">
                  <strong>横向规则（左右大组轮动）</strong>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Radio.Group
                    value={activeScheme.columnShift.mode}
                    onChange={(e) =>
                      setActiveScheme({
                        ...activeScheme,
                        columnShift: { ...activeScheme.columnShift, mode: e.target.value as RotationColumnMode },
                      })
                    }
                  >
                    <Space direction="vertical" size={6}>
                      <Radio value="OUTER_TO_INNER">
                        <strong>边列进中，中列出边（推荐）</strong>
                        <div style={{ fontSize: 11, color: "var(--muted)", paddingLeft: 22 }}>
                          外侧两列向内移入中央，中间向外侧移动，保持同桌搭档
                        </div>
                      </Radio>
                      <Radio value="GROUP_CYCLE_RIGHT">
                        <strong>大组整体向右循环</strong>
                        <div style={{ fontSize: 11, color: "var(--muted)", paddingLeft: 22 }}>
                          按大组依次向右平移一组，最右组循环回最左组
                        </div>
                      </Radio>
                      <Radio value="GROUP_CYCLE_LEFT">
                        <strong>大组整体向左循环</strong>
                        <div style={{ fontSize: 11, color: "var(--muted)", paddingLeft: 22 }}>
                          按大组依次向左平移一组，最左组循环回最右组
                        </div>
                      </Radio>
                      <Radio value="COLUMN_MIRROR">
                        <strong>左右两翼完全镜像对调</strong>
                      </Radio>
                    </Space>
                  </Radio.Group>
                </div>
              </div>

              <Divider style={{ margin: "14px 0" }} />

              {/* 约束与保护 */}
              <div className="scheme-section-block">
                <div className="scheme-block-title">
                  <strong>特殊保护机制</strong>
                </div>
                <div style={{ marginTop: 8 }}>
                  <Checkbox
                    checked={activeScheme.options.respectLocks}
                    onChange={(e) =>
                      setActiveScheme({
                        ...activeScheme,
                        options: { ...activeScheme.options, respectLocks: e.target.checked },
                      })
                    }
                  >
                    保护已锁定的座位（当前已标记 {lockedSeatKeys.size} 席）
                  </Checkbox>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "4px 0 0 24px" }}>
                    被锁定的学生将固定在原座位不参与轮换，其他学生顺延跳过。
                  </p>
                </div>
              </div>

              {/* 另存为自定义方案按钮 */}
              <div style={{ marginTop: 18 }}>
                {!isSavingCustom ? (
                  <Button
                    size="small"
                    icon={<PlusOutlined />}
                    onClick={() => setIsSavingCustom(true)}
                  >
                    将当前参数另存为新方案
                  </Button>
                ) : (
                  <Space.Compact style={{ width: "100%" }}>
                    <Input
                      size="small"
                      placeholder="输入自定义方案名称（如：单周轮换方案）"
                      value={saveNameInput}
                      onChange={(e) => setSaveNameInput(e.target.value)}
                    />
                    <Button size="small" type="primary" onClick={handleSaveCustomScheme}>
                      保存
                    </Button>
                    <Button size="small" onClick={() => setIsSavingCustom(false)}>
                      取消
                    </Button>
                  </Space.Compact>
                )}
              </div>
            </div>
          </Col>

          {/* 右侧实时对比预览 */}
          <Col xs={24} md={12}>
            <div className="scheme-preview-panel">
              <div className="scheme-block-title">
                <strong>即时排座演算预览</strong>
                <Space size={6}>
                  <Tag color="green">移动 {rotationPreview.movedCount} 人</Tag>
                  {rotationPreview.lockedCount > 0 && (
                    <Tag color="gold"><LockOutlined /> 锁定 {rotationPreview.lockedCount} 人</Tag>
                  )}
                </Space>
              </div>

              <div className="scheme-preview-stat-bar">
                <span>教室容量：{rows} 排 × {columns} 列</span>
                <span>已安排：{currentAssignments.length} 人</span>
              </div>

              {/* 变动名单抽样对比列表 */}
              <div className="scheme-preview-diff-list">
                <div className="scheme-diff-header">
                  <span>学生</span>
                  <span>原位置</span>
                  <span>→</span>
                  <span>新位置</span>
                </div>
                <div className="scheme-diff-scroll">
                  {positionDiffMap.map((diff) => (
                    <div
                      key={diff.studentId}
                      className={`scheme-diff-row ${diff.isLocked ? "scheme-diff-row-locked" : diff.hasChanged ? "scheme-diff-row-changed" : ""}`}
                    >
                      <span className="diff-name">
                        {diff.name}
                        {diff.isLocked && <LockOutlined style={{ color: "var(--gold-accent)", marginLeft: 4 }} />}
                      </span>
                      <span className="diff-coord">{diff.fromRow}排{diff.fromCol}座</span>
                      <span className="diff-arrow">→</span>
                      <span className="diff-coord diff-new-coord">{diff.toRow}排{diff.toCol}座</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </div>
    </Modal>
  );
}
