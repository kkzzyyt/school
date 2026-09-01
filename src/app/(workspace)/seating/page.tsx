"use client";

import {
  ClearOutlined,
  CloseOutlined,
  ColumnWidthOutlined,
  DragOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  HolderOutlined,
  InboxOutlined,
  LoginOutlined,
  PlusOutlined,
  RedoOutlined,
  RollbackOutlined,
  SaveOutlined,
  SwapOutlined,
  UndoOutlined,
  WindowsOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Card,
  Divider,
  Dropdown,
  Input,
  InputNumber,
  Segmented,
  Select,
  Skeleton,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import type { MenuProps } from "antd";
import { useEffect, useMemo, useReducer, useState } from "react";

import { PageHeading } from "@/components/layout/PageHeading";
import {
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ENVIRONMENT,
  DEFAULT_SEATING_ROWS,
  getSeatingAisleColumns,
  isSeatingAisleColumn,
  type SeatingEnvironment,
  type SeatingSideLayout,
} from "@/domain/seating";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

interface Student { id: string; name: string; studentNo: string; gender: string }
interface Assignment { studentId: string; row: number; column: number }
interface SeatingData {
  rows: number;
  columns: number;
  students: Student[];
  assignments: Assignment[];
  environment: SeatingEnvironment;
}

interface SeatingDraft {
  rows: number;
  columns: number;
  assignments: Assignment[];
  environment: SeatingEnvironment;
}

interface EditorState {
  draft: SeatingDraft | null;
  past: SeatingDraft[];
  future: SeatingDraft[];
  pendingDimensions: { rows: number; columns: number };
}

type EditorAction =
  | { type: "load"; draft: SeatingDraft }
  | { type: "commit"; draft: SeatingDraft }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; draft: SeatingDraft }
  | { type: "setPendingDimensions"; dimensions: { rows: number; columns: number } };

type StudentFilter = "unassigned" | "all";
type SideKey = keyof SeatingEnvironment;
type SideFeature = "WINDOW" | "DOOR";

const sideLabels: Record<SideKey, string> = { left: "左侧", right: "右侧" };
const featureLabels: Record<SideFeature, string> = { WINDOW: "窗户", DOOR: "门口" };
const maxHistoryLength = 30;

function sortAssignments(assignments: Assignment[]) {
  return [...assignments].sort(
    (left, right) => left.row - right.row || left.column - right.column,
  );
}

function cloneEnvironment(environment: SeatingEnvironment): SeatingEnvironment {
  return {
    left: { windows: [...environment.left.windows], doorRow: environment.left.doorRow },
    right: { windows: [...environment.right.windows], doorRow: environment.right.doorRow },
  };
}

function toDraft(data: SeatingData): SeatingDraft {
  const environment = data.environment ?? DEFAULT_SEATING_ENVIRONMENT;
  return {
    rows: data.rows,
    columns: data.columns,
    assignments: sortAssignments(data.assignments),
    environment: cloneEnvironment(environment),
  };
}

function draftKey(draft: SeatingDraft | null) {
  return draft ? JSON.stringify(draft) : "";
}

function draftsEqual(left: SeatingDraft | null, right: SeatingDraft | null) {
  return draftKey(left) === draftKey(right);
}

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "load":
      return {
        draft: action.draft,
        past: [],
        future: [],
        pendingDimensions: { rows: action.draft.rows, columns: action.draft.columns },
      };
    case "commit":
      if (!state.draft || draftsEqual(state.draft, action.draft)) return state;
      return {
        draft: action.draft,
        past: [...state.past, state.draft].slice(-maxHistoryLength),
        future: [],
        pendingDimensions: action.draft.rows === state.draft.rows && action.draft.columns === state.draft.columns
          ? state.pendingDimensions
          : { rows: action.draft.rows, columns: action.draft.columns },
      };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous || !state.draft) return state;
      return {
        draft: previous,
        past: state.past.slice(0, -1),
        future: [state.draft, ...state.future].slice(0, maxHistoryLength),
        pendingDimensions: { rows: previous.rows, columns: previous.columns },
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next || !state.draft) return state;
      return {
        draft: next,
        past: [...state.past, state.draft].slice(-maxHistoryLength),
        future: state.future.slice(1),
        pendingDimensions: { rows: next.rows, columns: next.columns },
      };
    }
    case "reset":
      return {
        draft: action.draft,
        past: [],
        future: [],
        pendingDimensions: { rows: action.draft.rows, columns: action.draft.columns },
      };
    case "setPendingDimensions":
      return { ...state, pendingDimensions: action.dimensions };
    default:
      return state;
  }
}

function sideFeatureForRow(side: SeatingSideLayout, row: number): SideFeature | null {
  if (side.doorRow === row) return "DOOR";
  if (side.windows.includes(row)) return "WINDOW";
  return null;
}

function featureIcon(feature: SideFeature | null) {
  if (feature === "WINDOW") return <WindowsOutlined />;
  if (feature === "DOOR") return <LoginOutlined />;
  return <PlusOutlined />;
}

function trimSideLayout(side: SeatingSideLayout, rows: number): SeatingSideLayout {
  return {
    windows: side.windows.filter((row) => row <= rows),
    doorRow: side.doorRow && side.doorRow <= rows ? side.doorRow : null,
  };
}

export default function SeatingPage() {
  const { message, modal } = App.useApp();
  const { data, loading, error, refresh } = useApiData<SeatingData>("/api/seating");
  const [editor, dispatch] = useReducer(editorReducer, {
    draft: null,
    past: [],
    future: [],
    pendingDimensions: { rows: DEFAULT_SEATING_ROWS, columns: DEFAULT_SEATING_COLUMNS },
  });
  const [studentQuery, setStudentQuery] = useState("");
  const [studentFilter, setStudentFilter] = useState<StudentFilter>("unassigned");
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [draggingStudentId, setDraggingStudentId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showLeftSide, setShowLeftSide] = useState(true);
  const [showRightSide, setShowRightSide] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    const nextDraft = toDraft(data);
    dispatch({ type: "load", draft: nextDraft });
  }, [data]);

  const draft = editor.draft;
  const savedDraft = useMemo(() => (data ? toDraft(data) : null), [data]);
  const pendingDimensions = editor.pendingDimensions;
  const studentById = useMemo(
    () => new Map(data?.students.map((student) => [student.id, student]) ?? []),
    [data?.students],
  );
  const assignmentByPosition = useMemo(
    () => new Map(draft?.assignments.map((assignment) => [`${assignment.row}-${assignment.column}`, assignment]) ?? []),
    [draft?.assignments],
  );
  const assignmentByStudent = useMemo(
    () => new Map(draft?.assignments.map((assignment) => [assignment.studentId, assignment]) ?? []),
    [draft?.assignments],
  );
  const aisleColumns = useMemo(
    () => getSeatingAisleColumns(draft?.columns ?? DEFAULT_SEATING_COLUMNS),
    [draft?.columns],
  );
  const studentOptions = useMemo(
    () => data?.students.map((student) => ({
      value: student.id,
      label: `${student.name} · ${student.studentNo.slice(-3)}`,
    })) ?? [],
    [data?.students],
  );
  const filteredStudents = useMemo(() => {
    if (!data || !draft) return [];
    const normalizedQuery = studentQuery.trim().toLowerCase();
    return data.students.filter((student) => {
      const matchesFilter = studentFilter === "all" || !assignmentByStudent.has(student.id);
      const matchesQuery = !normalizedQuery
        || student.name.toLowerCase().includes(normalizedQuery)
        || student.studentNo.toLowerCase().includes(normalizedQuery);
      return matchesFilter && matchesQuery;
    });
  }, [assignmentByStudent, data, draft, studentFilter, studentQuery]);
  const assignedCount = draft?.assignments.length ?? 0;
  const studentCount = data?.students.length ?? 0;
  const availableSeatCount = draft
    ? draft.rows * (draft.columns - aisleColumns.length) - assignedCount
    : 0;
  const environmentFeatureCount = draft
    ? draft.environment.left.windows.length
      + draft.environment.right.windows.length
      + Number(draft.environment.left.doorRow !== null)
      + Number(draft.environment.right.doorRow !== null)
    : 0;
  const isDirty = Boolean(draft && savedDraft && !draftsEqual(draft, savedDraft));
  const selectedStudent = selectedStudentId ? studentById.get(selectedStudentId) : undefined;

  function leaveEditing() {
    if (!isDirty) {
      setIsEditing(false);
      setSelectedStudentId(null);
      setDropTarget(null);
      return;
    }

    modal.confirm({
      title: "放弃未保存的座次修改？",
      content: "当前调整尚未保存，退出编辑后这些修改会被撤销。",
      okText: "放弃修改",
      cancelText: "继续编辑",
      onOk: () => {
        if (savedDraft) dispatch({ type: "reset", draft: savedDraft });
        setIsEditing(false);
        setSelectedStudentId(null);
        setDropTarget(null);
      },
    });
  }

  function commitDraft(nextDraft: SeatingDraft) {
    dispatch({
      type: "commit",
      draft: {
        ...nextDraft,
        assignments: sortAssignments(nextDraft.assignments),
        environment: cloneEnvironment(nextDraft.environment),
      },
    });
  }

  function selectStudent(studentId: string) {
    if (!isEditing) return;
    setSelectedStudentId((current) => current === studentId ? null : studentId);
    if (assignmentByStudent.has(studentId)) setStudentFilter("all");
  }

  function placeStudent(studentId: string, row: number, column: number) {
    if (!isEditing || !draft || isSeatingAisleColumn(column, draft.columns)) return;
    const source = draft.assignments.find((assignment) => assignment.studentId === studentId);
    const target = assignmentByPosition.get(`${row}-${column}`);
    if (source?.row === row && source.column === column) {
      setSelectedStudentId(null);
      return;
    }

    let nextAssignments = draft.assignments.filter(
      (assignment) => assignment.studentId !== studentId
        && !(assignment.row === row && assignment.column === column),
    );
    if (source && target) {
      nextAssignments = nextAssignments.map((assignment) => assignment.studentId === target.studentId
        ? { ...assignment, row: source.row, column: source.column }
        : assignment);
    }
    nextAssignments.push({ studentId, row, column });
    commitDraft({ ...draft, assignments: nextAssignments });
    setSelectedStudentId(null);
  }

  function clearSeat(row: number, column: number) {
    if (!isEditing || !draft || !assignmentByPosition.has(`${row}-${column}`)) return;
    commitDraft({
      ...draft,
      assignments: draft.assignments.filter(
        (assignment) => assignment.row !== row || assignment.column !== column,
      ),
    });
    setSelectedStudentId(null);
  }

  function handleSeatClick(row: number, column: number) {
    if (!isEditing) return;
    const assignment = assignmentByPosition.get(`${row}-${column}`);
    if (selectedStudentId) {
      placeStudent(selectedStudentId, row, column);
    } else if (assignment) {
      selectStudent(assignment.studentId);
    }
  }

  function changeSeat(row: number, column: number, studentId?: string) {
    if (!isEditing) return;
    if (studentId) placeStudent(studentId, row, column);
    else clearSeat(row, column);
  }

  function startStudentDrag(event: React.DragEvent<HTMLElement>, studentId: string) {
    if (!isEditing) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", studentId);
    setDraggingStudentId(studentId);
  }

  function getDraggedStudentId(event: React.DragEvent<HTMLElement>) {
    return event.dataTransfer.getData("text/plain") || draggingStudentId;
  }

  function handleSeatDrop(event: React.DragEvent<HTMLDivElement>, row: number, column: number) {
    if (!isEditing) return;
    event.preventDefault();
    const studentId = getDraggedStudentId(event);
    if (studentId) placeStudent(studentId, row, column);
    setDraggingStudentId(null);
    setDropTarget(null);
  }

  function removeStudentFromLayout(studentId: string) {
    if (!isEditing || !draft || !assignmentByStudent.has(studentId)) return;
    commitDraft({
      ...draft,
      assignments: draft.assignments.filter((assignment) => assignment.studentId !== studentId),
    });
    setSelectedStudentId(null);
  }

  function handlePoolDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!isEditing) return;
    event.preventDefault();
    const studentId = getDraggedStudentId(event);
    if (studentId) removeStudentFromLayout(studentId);
    setDraggingStudentId(null);
    setDropTarget(null);
  }

  function setSideFeature(side: SideKey, row: number, feature: SideFeature | null) {
    if (!isEditing || !draft) return;
    const currentSide = draft.environment[side];
    const nextSide: SeatingSideLayout = {
      windows: currentSide.windows.filter((item) => item !== row),
      doorRow: currentSide.doorRow === row ? null : currentSide.doorRow,
    };
    if (feature === "WINDOW") nextSide.windows.push(row);
    if (feature === "DOOR") nextSide.doorRow = row;
    commitDraft({
      ...draft,
      environment: { ...draft.environment, [side]: nextSide },
    });
  }

  function applyDimensions() {
    if (!isEditing || !draft) return;
    const nextRows = pendingDimensions.rows;
    const nextColumns = pendingDimensions.columns;
    if (nextRows === draft.rows && nextColumns === draft.columns) return;

    const nextAisles = getSeatingAisleColumns(nextColumns);
    const displacedAssignments = draft.assignments.filter(
      (assignment) => assignment.row > nextRows
        || assignment.column > nextColumns
        || nextAisles.includes(assignment.column),
    );
    const nextEnvironment: SeatingEnvironment = {
      left: trimSideLayout(draft.environment.left, nextRows),
      right: trimSideLayout(draft.environment.right, nextRows),
    };
    const hasTrimmedFeatures = draft.environment.left.windows.length !== nextEnvironment.left.windows.length
      || draft.environment.right.windows.length !== nextEnvironment.right.windows.length
      || draft.environment.left.doorRow !== nextEnvironment.left.doorRow
      || draft.environment.right.doorRow !== nextEnvironment.right.doorRow;
    const apply = () => {
      commitDraft({
        ...draft,
        rows: nextRows,
        columns: nextColumns,
        assignments: draft.assignments.filter((assignment) => !displacedAssignments.includes(assignment)),
        environment: nextEnvironment,
      });
      setSelectedStudentId(null);
    };

    if (displacedAssignments.length || hasTrimmedFeatures) {
      const details = [
        displacedAssignments.length ? `${displacedAssignments.length} 位学生将回到待安排` : "",
        hasTrimmedFeatures ? "超出范围的窗户或门口标记将被移除" : "",
      ].filter(Boolean).join("；");
      modal.confirm({
        title: "确认应用新的座位规格？",
        content: details,
        okText: "继续调整",
        cancelText: "取消",
        onOk: apply,
      });
      return;
    }
    apply();
  }

  async function saveLayout() {
    if (!draft) return;
    setSaving(true);
    try {
      await apiRequest("/api/seating", {
        method: "PUT",
        body: JSON.stringify({
          rows: draft.rows,
          columns: draft.columns,
          assignments: draft.assignments,
          environment: draft.environment,
        }),
      });
      message.success("座次与教室标记已保存");
      setIsEditing(false);
      setSelectedStudentId(null);
      setDropTarget(null);
      await refresh();
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function renderSideRail(side: SideKey) {
    if (!draft) return null;
    const menuItems: MenuProps["items"] = [
      { key: "WINDOW", icon: <WindowsOutlined />, label: "窗户" },
      { key: "DOOR", icon: <LoginOutlined />, label: "门口" },
      { type: "divider" },
      { key: "NONE", icon: <ClearOutlined />, label: "清除标记" },
    ];
    return (
      <div className="room-side-column">
        <div className="room-column-label">{sideLabels[side]}</div>
        <div className="room-side-track" style={{ gridTemplateRows: `repeat(${draft.rows}, minmax(132px, 1fr))` }}>
          {Array.from({ length: draft.rows }, (_, index) => {
            const row = index + 1;
            const feature = sideFeatureForRow(draft.environment[side], row);
            const markerClass = `room-side-marker ${feature ? `room-side-marker-${feature.toLowerCase()}` : ""}`;
            const markerContent = (
              <>
                <span className="room-side-marker-icon">{featureIcon(feature)}</span>
                <span>{feature ? featureLabels[feature] : `第 ${row} 排`}</span>
              </>
            );

            if (!isEditing) {
              return (
                <div
                  key={`${side}-${row}`}
                  className={`${markerClass} room-side-marker-static`}
                  aria-label={`${sideLabels[side]}第 ${row} 排，${feature ? featureLabels[feature] : "未设置"}`}
                >
                  {markerContent}
                </div>
              );
            }

            return (
              <Dropdown
                key={`${side}-${row}`}
                menu={{
                  items: menuItems,
                  onClick: ({ key }) => setSideFeature(side, row, key === "NONE" ? null : key as SideFeature),
                }}
                trigger={["click"]}
              >
                <button
                  type="button"
                  className={markerClass}
                  aria-label={`${sideLabels[side]}第 ${row} 排，${feature ? featureLabels[feature] : "未设置"}`}
                  title={`${sideLabels[side]}第 ${row} 排`}
                >
                  {markerContent}
                </button>
              </Dropdown>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <>
      <PageHeading
        kicker="SEATING PLAN"
        title="班级座次表"
        description={isEditing ? "编辑模式：拖动学生或选择目标座位，完成后保存座次。" : "面向讲台查看教室布局，座次仅在编辑模式下可以调整。"}
        action={(
          <Space className="seating-heading-actions">
            {!isEditing ? (
              <Button type="primary" icon={<EditOutlined />} onClick={() => setIsEditing(true)}>
                编辑座次
              </Button>
            ) : (
              <>
                <Button icon={<RollbackOutlined />} onClick={leaveEditing} disabled={saving}>
                  取消编辑
                </Button>
                <Button
                  type="primary"
                  icon={<SaveOutlined />}
                  loading={saving}
                  disabled={!isDirty || !draft}
                  onClick={() => void saveLayout()}
                >
                  保存座次
                </Button>
              </>
            )}
          </Space>
        )}
      />
      {error && <Alert type="error" showIcon title={error.message} />}
      {loading || !data || !draft ? (
        <Card className="surface-card seating-loading-card">
          <Skeleton active paragraph={{ rows: 12 }} />
        </Card>
      ) : (
        <Card className="surface-card seating-workspace-card" styles={{ body: { padding: 0 } }}>
          <div className="seating-overview">
            <div className="seating-overview-heading">
              <div className="seating-overview-icon"><ColumnWidthOutlined /></div>
              <div>
                <div className="section-label">教室平面</div>
                <h2>座位编辑画布</h2>
              </div>
              <Tag color={isEditing ? (isDirty ? "orange" : "blue") : "green"}>
                {isEditing ? (isDirty ? "有未保存修改" : "编辑中") : "查看模式"}
              </Tag>
            </div>
            <div className="seating-overview-stats">
              <div className="seating-overview-stat">
                <span>已安排</span>
                <strong>{assignedCount}<small> / {studentCount}</small></strong>
              </div>
              <div className="seating-overview-stat">
                <span>空座位</span>
                <strong>{Math.max(availableSeatCount, 0)}</strong>
              </div>
              <div className="seating-overview-stat">
                <span>教室标记</span>
                <strong>{environmentFeatureCount}<small> 个</small></strong>
              </div>
            </div>
            {isEditing && (
              <div className="seating-history-actions">
                <Tooltip title="撤销上一步">
                  <Button
                    type="text"
                    aria-label="撤销上一步"
                    icon={<UndoOutlined />}
                    disabled={!editor.past.length}
                    onClick={() => { dispatch({ type: "undo" }); setSelectedStudentId(null); }}
                  />
                </Tooltip>
                <Tooltip title="重做">
                  <Button
                    type="text"
                    aria-label="重做"
                    icon={<RedoOutlined />}
                    disabled={!editor.future.length}
                    onClick={() => { dispatch({ type: "redo" }); setSelectedStudentId(null); }}
                  />
                </Tooltip>
              </div>
            )}
          </div>

          <div className={`seating-workspace-body ${isEditing ? "seating-workspace-body-editing" : "seating-workspace-body-view"}`}>
            {isEditing && <aside className="seating-sidebar">
              <div className="seating-sidebar-section seating-layout-section">
                <div className="seating-section-heading">
                  <div>
                    <h2>布局设置</h2>
                    <span>调整后点击应用</span>
                  </div>
                  <Tag>{draft.rows} × {draft.columns}</Tag>
                </div>
                <div className="seating-dimension-fields">
                  <label>
                    <span>排数</span>
                    <InputNumber
                      min={1}
                      max={12}
                      value={pendingDimensions.rows}
                      onChange={(value) => dispatch({ type: "setPendingDimensions", dimensions: { ...pendingDimensions, rows: value ?? pendingDimensions.rows } })}
                      controls
                    />
                  </label>
                  <label>
                    <span>列数</span>
                    <InputNumber
                      min={1}
                      max={12}
                      value={pendingDimensions.columns}
                      onChange={(value) => dispatch({ type: "setPendingDimensions", dimensions: { ...pendingDimensions, columns: value ?? pendingDimensions.columns } })}
                      controls
                    />
                  </label>
                </div>
                <div className="seating-layout-capacity">
                  <span>可用座位</span>
                  <strong>{draft.rows * (draft.columns - aisleColumns.length)} 个</strong>
                  <small>含 {aisleColumns.length} 条过道</small>
                </div>
                <Button
                  block
                  icon={<ColumnWidthOutlined />}
                  disabled={pendingDimensions.rows === draft.rows && pendingDimensions.columns === draft.columns}
                  onClick={applyDimensions}
                >
                  应用布局
                </Button>
              </div>

              <Divider />

              <div className="seating-sidebar-section seating-environment-section">
                <div className="seating-section-heading">
                  <div>
                    <h2>教室标记</h2>
                    <span>点击两侧排位设置</span>
                  </div>
                  <Tag icon={<WindowsOutlined />}>{environmentFeatureCount}</Tag>
                </div>
                <div className="seating-environment-list">
                  <div><span className="seating-feature-symbol seating-feature-window"><WindowsOutlined /></span><span>窗户</span><strong>{draft.environment.left.windows.length + draft.environment.right.windows.length}</strong></div>
                  <div><span className="seating-feature-symbol seating-feature-door"><LoginOutlined /></span><span>门口</span><strong>{Number(draft.environment.left.doorRow !== null) + Number(draft.environment.right.doorRow !== null)}</strong></div>
                </div>
              </div>

              <Divider />

              <div className="seating-sidebar-section seating-student-pool-section">
                <div className="seating-section-heading seating-pool-heading">
                  <div>
                    <h2>学生池</h2>
                    <span>{filteredStudents.length} 名学生</span>
                  </div>
                  <Tag color={assignedCount === studentCount ? "green" : "orange"}>待安排 {studentCount - assignedCount}</Tag>
                </div>
                <Input
                  allowClear
                  prefix={<HolderOutlined />}
                  placeholder="搜索姓名或学号"
                  value={studentQuery}
                  onChange={(event) => setStudentQuery(event.target.value)}
                />
                <Segmented
                  block
                  options={[{ label: "待安排", value: "unassigned" }, { label: "全部学生", value: "all" }]}
                  value={studentFilter}
                  onChange={(value) => setStudentFilter(value as StudentFilter)}
                />
                {selectedStudent && (
                  <div className="seating-selection-bar">
                    <span className="student-avatar student-avatar-selected">{selectedStudent.name.slice(0, 1)}</span>
                    <span>已选中 <strong>{selectedStudent.name}</strong></span>
                    <Button type="text" aria-label="取消选择学生" icon={<CloseOutlined />} onClick={() => setSelectedStudentId(null)} />
                  </div>
                )}
                <div
                  className={`student-pool-list ${draggingStudentId ? "student-pool-list-drop-active" : ""}`}
                  onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                  onDrop={handlePoolDrop}
                >
                  {filteredStudents.length ? filteredStudents.map((student) => {
                    const assignment = assignmentByStudent.get(student.id);
                    const isSelected = selectedStudentId === student.id;
                    return (
                      <button
                        type="button"
                        key={student.id}
                        className={`student-pool-item ${isSelected ? "student-pool-item-selected" : ""} ${draggingStudentId === student.id ? "student-pool-item-dragging" : ""}`}
                        draggable
                        aria-pressed={isSelected}
                        onClick={() => selectStudent(student.id)}
                        onDragStart={(event) => startStudentDrag(event, student.id)}
                        onDragEnd={() => { setDraggingStudentId(null); setDropTarget(null); }}
                      >
                        <span className={`student-avatar ${student.gender === "FEMALE" ? "student-avatar-female" : ""}`}>{student.name.slice(0, 1)}</span>
                        <span className="student-pool-copy">
                          <strong>{student.name}</strong>
                          <small>{student.studentNo}</small>
                        </span>
                        <span className="student-pool-location">{assignment ? `${assignment.row}排${assignment.column}座` : "未安排"}</span>
                        <HolderOutlined className="student-drag-icon" />
                      </button>
                    );
                  }) : (
                    <div className="student-pool-empty"><InboxOutlined /><span>没有符合条件的学生</span></div>
                  )}
                </div>
              </div>
            </aside>}

            <section className="seating-canvas-section" aria-label="教室座位画布">
              <div className="seating-canvas-toolbar">
                <div>
                  <strong>面向讲台</strong>
                  <span>{draft.rows} 排 · {draft.columns - aisleColumns.length} 个座位/排</span>
                </div>
                <div className="seating-canvas-options">
                  <div className="seating-view-controls" aria-label="画布显示选项">
                    <span className="seating-view-controls-label"><EyeOutlined /> 显示侧边</span>
                    <label>
                      <Switch size="small" checked={showLeftSide} onChange={setShowLeftSide} aria-label="显示左侧内容" />
                      <span>左侧</span>
                    </label>
                    <label>
                      <Switch size="small" checked={showRightSide} onChange={setShowRightSide} aria-label="显示右侧内容" />
                      <span>右侧</span>
                    </label>
                  </div>
                  <div className="seating-legend">
                  <span>{isEditing ? <DragOutlined /> : <EyeInvisibleOutlined />}{isEditing ? "拖放编辑" : "只读查看"}</span>
                  <span><ColumnWidthOutlined />过道 {aisleColumns.length}</span>
                  {isEditing && <><span><WindowsOutlined />窗户</span><span><LoginOutlined />门口</span></>}
                  </div>
                </div>
              </div>

              <div className="seating-map-scroll">
                <div className="seating-map" style={{ minWidth: `${Math.max(980, draft.columns * 144 + 220)}px` }}>
                  <div className="room-front">
                    <span>前方</span>
                    <div className="blackboard"><strong>讲台</strong><small>BLACKBOARD</small></div>
                    <span>后方</span>
                  </div>
                  <div className={`room-layout ${showLeftSide ? "" : "room-layout-no-left"} ${showRightSide ? "" : "room-layout-no-right"}`}>
                    {showLeftSide && renderSideRail("left")}
                    <div className="room-center-column">
                      <div className="room-column-label">座位区</div>
                      <div className="seat-grid" style={{ gridTemplateColumns: aisleColumns.length ? Array.from({ length: draft.columns }, (_, index) => aisleColumns.includes(index + 1) ? "34px" : "minmax(144px, 1fr)").join(" ") : `repeat(${draft.columns}, minmax(144px, 1fr))` }}>
                        {Array.from({ length: draft.rows * draft.columns }, (_, index) => {
                          const row = Math.floor(index / draft.columns) + 1;
                          const column = (index % draft.columns) + 1;
                          if (isSeatingAisleColumn(column, draft.columns)) {
                            return (
                              <div className="seat-aisle" aria-hidden="true" key={`${row}-${column}`}>
                                {row === 1 && <span>过道</span>}
                              </div>
                            );
                          }
                          const assignment = assignmentByPosition.get(`${row}-${column}`);
                          const student = assignment ? studentById.get(assignment.studentId) : undefined;
                          const positionKey = `${row}-${column}`;
                          const isTarget = dropTarget === positionKey;
                          return (
                            <div
                              className={`seat-cell ${student ? "seat-cell-filled" : "seat-cell-empty"} ${isEditing ? "seat-cell-editable" : "seat-cell-readonly"} ${isTarget ? "seat-cell-drop-target" : ""}`}
                              key={positionKey}
                              onClick={isEditing ? () => handleSeatClick(row, column) : undefined}
                              onDragEnter={isEditing ? () => setDropTarget(positionKey) : undefined}
                              onDragOver={isEditing ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(positionKey); } : undefined}
                              onDragLeave={isEditing ? () => setDropTarget((current) => current === positionKey ? null : current) : undefined}
                              onDrop={isEditing ? (event) => handleSeatDrop(event, row, column) : undefined}
                            >
                              <div className="seat-cell-header"><span>第 {row} 排</span><span>{column} 座</span></div>
                              {student ? (
                                <div className="seat-student-row">
                                  {isEditing ? (
                                    <button
                                      type="button"
                                      className={`seat-student ${selectedStudentId === student.id ? "seat-student-selected" : ""}`}
                                      draggable
                                      aria-pressed={selectedStudentId === student.id}
                                      onClick={(event) => { event.stopPropagation(); selectStudent(student.id); }}
                                      onDragStart={(event) => startStudentDrag(event, student.id)}
                                      onDragEnd={() => { setDraggingStudentId(null); setDropTarget(null); }}
                                    >
                                      <span className={`student-avatar ${student.gender === "FEMALE" ? "student-avatar-female" : ""}`}>{student.name.slice(0, 1)}</span>
                                      <span className="seat-student-copy"><strong title={student.name}>{student.name}</strong><small>{student.studentNo}</small></span>
                                      <HolderOutlined className="student-drag-icon" />
                                    </button>
                                  ) : (
                                    <div className="seat-student seat-student-readonly">
                                      <span className={`student-avatar ${student.gender === "FEMALE" ? "student-avatar-female" : ""}`}>{student.name.slice(0, 1)}</span>
                                      <span className="seat-student-copy"><strong title={student.name}>{student.name}</strong><small>{student.studentNo}</small></span>
                                    </div>
                                  )}
                                  {isEditing && <Tooltip title="移出座位">
                                    <Button
                                      type="text"
                                      className="seat-clear-button"
                                      aria-label={`移出${student.name}`}
                                      icon={<CloseOutlined />}
                                      onClick={(event) => { event.stopPropagation(); clearSeat(row, column); }}
                                    />
                                  </Tooltip>}
                                </div>
                              ) : (
                                <div className="seat-empty-editor">
                                  <div className="seat-empty-trigger"><DragOutlined /><span>空座</span></div>
                                  {isEditing && <Select
                                    showSearch
                                    variant="filled"
                                    aria-label={`${row}排${column}座学生`}
                                    placeholder="选择学生"
                                    optionFilterProp="label"
                                    value={undefined}
                                    options={studentOptions}
                                    onClick={(event) => event.stopPropagation()}
                                    onChange={(value) => changeSeat(row, column, typeof value === "string" ? value : undefined)}
                                  />}
                                </div>
                              )}
                              {student && isEditing && <Select
                                showSearch
                                variant="filled"
                                aria-label={`${row}排${column}座学生`}
                                placeholder="更换学生"
                                optionFilterProp="label"
                                value={undefined}
                                options={studentOptions}
                                onClick={(event) => event.stopPropagation()}
                                onChange={(value) => changeSeat(row, column, typeof value === "string" ? value : undefined)}
                              />}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {showRightSide && renderSideRail("right")}
                  </div>
                </div>
              </div>
            </section>
          </div>

          {isEditing && <div className="seating-workspace-footer">
            <Space size={6}><SwapOutlined /><span>拖动已安排学生到其他座位可直接交换；拖回学生池即可取消安排。</span></Space>
            <span className="seating-footer-capacity">座位容量 {draft.rows * (draft.columns - aisleColumns.length)} · 当前安排 {assignedCount}</span>
          </div>}
        </Card>
      )}
    </>
  );
}
