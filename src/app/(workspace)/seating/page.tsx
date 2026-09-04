"use client";

import {
  CloseOutlined,
  ColumnWidthOutlined,
  DragOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  FileExcelOutlined,
  HolderOutlined,
  LoginOutlined,
  PlusOutlined,
  PrinterOutlined,
  RedoOutlined,
  RollbackOutlined,
  SearchOutlined,
  SaveOutlined,
  SettingOutlined,
  SwapOutlined,
  TeamOutlined,
  UndoOutlined,
  WindowsOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Button,
  Checkbox,
  Input,
  InputNumber,
  Modal,
  Dropdown,
  Skeleton,
  Space,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import type { MenuProps } from "antd";
import { Fragment, type CSSProperties, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from "react";

import { LedgerSheet } from "@/components/layout/LedgerSheet";
import {
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ENVIRONMENT,
  DEFAULT_SEATING_ROWS,
  DEFAULT_SEATING_SIDE_MARKER_ROWS,
  MAX_DOORS_PER_SIDE,
  createDefaultSeatingEnvironment,
  getSeatingAisleAfterColumns,
  isSeatingAisleAfterColumn,
  type SeatingEnvironment,
  type SeatingSideLayout,
} from "@/domain/seating";
import { resolveStudentGender, type StudentGenderValue } from "@/domain/student-gender";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";
import {
  buildSeatingMatrix,
  buildSeatingRosterRows,
  getSeatingExportTracks,
  getSeatingExportFilename,
} from "@/lib/seating-export";

interface Student { id: string; name: string; studentNo: string; gender: StudentGenderValue }
interface Assignment { studentId: string; row: number; column: number }
interface SeatingData {
  rows: number;
  columns: number;
  revision: string | null;
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

interface PendingDimensions {
  rows: number;
  columns: number;
  environment: SeatingEnvironment;
}

interface FloatingPanelPosition {
  x: number;
  y: number;
}

interface EditorState {
  draft: SeatingDraft | null;
  past: SeatingDraft[];
  future: SeatingDraft[];
  pendingDimensions: PendingDimensions;
}

type EditorAction =
  | { type: "load"; draft: SeatingDraft }
  | { type: "commit"; draft: SeatingDraft }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; draft: SeatingDraft }
  | { type: "setPendingDimensions"; dimensions: PendingDimensions };

type SideKey = "left" | "right";
type SideFeature = "WINDOW" | "DOOR";

const sideLabels: Record<SideKey, string> = { left: "左侧", right: "右侧" };
const featureLabels: Record<SideFeature, string> = { WINDOW: "窗户", DOOR: "门口" };
const maxHistoryLength = 30;
const seatGridMinimumSeatWidth = 76;
const seatGridAisleWidth = 22;
const seatGridGap = 6;

function sortAssignments(assignments: Assignment[]) {
  return [...assignments].sort(
    (left, right) => left.row - right.row || left.column - right.column,
  );
}

function studentDisplayLabel(student: Student) {
  return `${student.name} · ${student.studentNo.slice(-4)}`;
}

function cloneEnvironment(environment: SeatingEnvironment): SeatingEnvironment {
  return {
    aisleAfterColumns: [...new Set(environment.aisleAfterColumns)].sort((left, right) => left - right),
    left: {
      windows: [...environment.left.windows].sort((left, right) => left - right),
      doorRows: [...environment.left.doorRows].sort((left, right) => left - right),
    },
    right: {
      windows: [...environment.right.windows].sort((left, right) => left - right),
      doorRows: [...environment.right.doorRows].sort((left, right) => left - right),
    },
    rear: { ...environment.rear },
    // Preserve legacy payloads without exposing them to the seating editor.
    ...(environment.fixedFacilities ? { fixedFacilities: environment.fixedFacilities } : {}),
  };
}

function pendingDimensionsFor(draft: SeatingDraft) {
  const environment = cloneEnvironment(draft.environment);
  return {
    rows: draft.rows,
    columns: draft.columns,
    environment,
  };
}

function sameNumberList(left: readonly number[], right: readonly number[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function clampFloatingPanelPosition(
  panel: HTMLElement,
  position: FloatingPanelPosition,
): FloatingPanelPosition {
  const maxX = Math.max(12, window.innerWidth - panel.offsetWidth - 12);
  const maxY = Math.max(12, window.innerHeight - panel.offsetHeight - 12);
  return {
    x: Math.min(maxX, Math.max(12, position.x)),
    y: Math.min(maxY, Math.max(12, position.y)),
  };
}

function sameSideLayout(left: SeatingSideLayout, right: SeatingSideLayout) {
  return sameNumberList(left.doorRows, right.doorRows)
    && sameNumberList(left.windows, right.windows);
}

function environmentsEqual(left: SeatingEnvironment, right: SeatingEnvironment) {
  return sameNumberList(left.aisleAfterColumns, right.aisleAfterColumns)
    && sameSideLayout(left.left, right.left)
    && sameSideLayout(left.right, right.right);
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
        pendingDimensions: pendingDimensionsFor(action.draft),
      };
    case "commit":
      if (!state.draft || draftsEqual(state.draft, action.draft)) return state;
      return {
        draft: action.draft,
        past: [...state.past, state.draft].slice(-maxHistoryLength),
        future: [],
        pendingDimensions: pendingDimensionsFor(action.draft),
      };
    case "undo": {
      const previous = state.past.at(-1);
      if (!previous || !state.draft) return state;
      return {
        draft: previous,
        past: state.past.slice(0, -1),
        future: [state.draft, ...state.future].slice(0, maxHistoryLength),
        pendingDimensions: pendingDimensionsFor(previous),
      };
    }
    case "redo": {
      const next = state.future[0];
      if (!next || !state.draft) return state;
      return {
        draft: next,
        past: [...state.past, state.draft].slice(-maxHistoryLength),
        future: state.future.slice(1),
        pendingDimensions: pendingDimensionsFor(next),
      };
    }
    case "reset":
      return {
        draft: action.draft,
        past: [],
        future: [],
        pendingDimensions: pendingDimensionsFor(action.draft),
      };
    case "setPendingDimensions":
      return { ...state, pendingDimensions: action.dimensions };
    default:
      return state;
  }
}

function sideFeatureForRow(side: SeatingSideLayout, row: number): SideFeature | null {
  if (side.doorRows.includes(row)) return "DOOR";
  if (side.windows.includes(row)) return "WINDOW";
  return null;
}

function featureIcon(feature: SideFeature | null) {
  if (feature === "WINDOW") return <WindowsOutlined />;
  if (feature === "DOOR") return <LoginOutlined />;
  return <PlusOutlined />;
}

function studentToneClass(student: Student) {
  const gender = resolveStudentGender(student.gender, student.name).value;
  if (gender === "MALE") return "seat-student-male";
  if (gender === "FEMALE") return "seat-student-female";
  return "seat-student-neutral";
}

export default function SeatingPage() {
  const { message, modal } = App.useApp();
  const { data, loading, error, refresh } = useApiData<SeatingData>("/api/seating");
  const [editor, dispatch] = useReducer(editorReducer, {
    draft: null,
    past: [],
    future: [],
    pendingDimensions: {
      rows: DEFAULT_SEATING_ROWS,
      columns: DEFAULT_SEATING_COLUMNS,
      environment: createDefaultSeatingEnvironment(),
    },
  });
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [draggingStudentId, setDraggingStudentId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [showLeftSide, setShowLeftSide] = useState(true);
  const [showRightSide, setShowRightSide] = useState(true);
  const [studentPoolPosition, setStudentPoolPosition] = useState<FloatingPanelPosition | null>(null);
  const [studentPoolOpen, setStudentPoolOpen] = useState(false);
  const [studentPoolQuery, setStudentPoolQuery] = useState("");
  const [draggingStudentPool, setDraggingStudentPool] = useState(false);
  const [layoutSettingsModalOpen, setLayoutSettingsModalOpen] = useState(false);
  const [aisleSettingsModalOpen, setAisleSettingsModalOpen] = useState(false);
  const [seatActionMenuKey, setSeatActionMenuKey] = useState<string | null>(null);
  const studentPoolCanvasRef = useRef<HTMLElement>(null);
  const studentPoolPanelRef = useRef<HTMLElement>(null);
  const studentPoolDrag = useRef<{
    panel: HTMLElement;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const seatLongPressTimer = useRef<number | null>(null);
  const seatLongPressOrigin = useRef<{ x: number; y: number } | null>(null);
  const suppressNextSeatClick = useRef(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!data) return;
    const nextDraft = toDraft(data);
    dispatch({ type: "load", draft: nextDraft });
  }, [data]);

  useLayoutEffect(() => {
    if (!isEditing || studentPoolPosition !== null) return;
    const canvas = studentPoolCanvasRef.current;
    if (!canvas) return;
    const canvasRect = canvas.getBoundingClientRect();
    setStudentPoolPosition({ x: canvasRect.left + 12, y: canvasRect.top + 12 });
  }, [isEditing, studentPoolPosition]);

  useEffect(() => {
    if (!isEditing || studentPoolPosition === null) return;
    const panel = studentPoolPanelRef.current;
    if (!panel) return;

    const clampPosition = () => {
      setStudentPoolPosition((current) => {
        if (!current) return current;
        const next = clampFloatingPanelPosition(panel, current);
        return next.x === current.x && next.y === current.y ? current : next;
      });
    };

    clampPosition();
    const observer = new ResizeObserver(clampPosition);
    observer.observe(panel);
    window.addEventListener("resize", clampPosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", clampPosition);
    };
  }, [isEditing, studentPoolOpen, studentPoolPosition]);

  useEffect(() => {
    if (!isEditing || !seatActionMenuKey) return;
    const closeSeatActionMenu = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setSeatActionMenuKey(null);
    };
    window.addEventListener("keydown", closeSeatActionMenu, true);
    return () => window.removeEventListener("keydown", closeSeatActionMenu, true);
  }, [isEditing, seatActionMenuKey]);

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
  const aisleAfterColumns = useMemo(
    () => getSeatingAisleAfterColumns(
      draft?.columns ?? DEFAULT_SEATING_COLUMNS,
      draft?.environment.aisleAfterColumns,
    ),
    [draft?.columns, draft?.environment.aisleAfterColumns],
  );
  const seatGridTemplate = useMemo(
    () => Array.from({ length: draft?.columns ?? DEFAULT_SEATING_COLUMNS }, (_, index) => {
      const column = index + 1;
      return [
        `minmax(var(--seat-grid-min-seat-width, ${seatGridMinimumSeatWidth}px), 1fr)`,
        ...(aisleAfterColumns.includes(column) ? [`${seatGridAisleWidth}px`] : []),
      ];
    }).flat().join(" "),
    [aisleAfterColumns, draft?.columns],
  );
  const seatGridMinimumWidth = useMemo(() => {
    const seatColumnCount = draft?.columns ?? DEFAULT_SEATING_COLUMNS;
    const gridTrackCount = seatColumnCount + aisleAfterColumns.length;
    return seatColumnCount * seatGridMinimumSeatWidth
      + aisleAfterColumns.length * seatGridAisleWidth
      + Math.max(0, gridTrackCount - 1) * seatGridGap;
  }, [aisleAfterColumns.length, draft?.columns]);
  const poolStudents = useMemo(() => {
    if (!data || !draft) return [];
    return [...data.students].sort((left, right) => {
      const leftAssigned = assignmentByStudent.has(left.id);
      const rightAssigned = assignmentByStudent.has(right.id);
      if (leftAssigned !== rightAssigned) return Number(leftAssigned) - Number(rightAssigned);
      return left.studentNo.localeCompare(right.studentNo, "zh-CN");
    });
  }, [assignmentByStudent, data, draft]);
  const filteredPoolStudents = useMemo(() => {
    const query = studentPoolQuery.trim().toLocaleLowerCase();
    if (!query) return poolStudents;
    return poolStudents.filter((student) => (
      student.name.toLocaleLowerCase().includes(query)
      || student.studentNo.toLocaleLowerCase().includes(query)
    ));
  }, [poolStudents, studentPoolQuery]);
  const assignedCount = draft?.assignments.length ?? 0;
  const studentCount = data?.students.length ?? 0;
  const unassignedStudentCount = data?.students.filter((student) => !assignmentByStudent.has(student.id)).length ?? 0;
  const availableSeatCount = draft
    ? draft.rows * draft.columns - assignedCount
    : 0;
  const environmentFeatureCount = draft
    ? draft.environment.left.windows.length
      + draft.environment.right.windows.length
      + draft.environment.left.doorRows.length
      + draft.environment.right.doorRows.length
    : 0;
  const isDirty = Boolean(draft && savedDraft && !draftsEqual(draft, savedDraft));

  function closeStudentPool() {
    setStudentPoolOpen(false);
    setStudentPoolQuery("");
  }

  function toggleStudentPool() {
    if (studentPoolOpen) closeStudentPool();
    else setStudentPoolOpen(true);
  }

  function enterEditing() {
    const canvas = studentPoolCanvasRef.current;
    const canvasRect = canvas?.getBoundingClientRect();
    setStudentPoolPosition(canvasRect ? { x: canvasRect.left + 12, y: canvasRect.top + 12 } : null);
    setStudentPoolQuery("");
    setStudentPoolOpen(false);
    setIsEditing(true);
  }

  function leaveEditing() {
    if (!isDirty) {
      setIsEditing(false);
      setStudentPoolPosition(null);
      closeStudentPool();
      setSelectedStudentId(null);
      setDropTarget(null);
      setSeatActionMenuKey(null);
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
        setStudentPoolPosition(null);
        closeStudentPool();
        setSelectedStudentId(null);
        setDropTarget(null);
        setSeatActionMenuKey(null);
      },
    });
  }

  function printSeating() {
    if (!draft) return;
    const workspaceMain = document.querySelector<HTMLElement>(".workspace-main");
    const previousMarginLeft = workspaceMain?.style.marginLeft;
    workspaceMain?.style.setProperty("margin-left", "0px");
    window.addEventListener("afterprint", () => {
      if (!workspaceMain) return;
      if (previousMarginLeft) workspaceMain.style.marginLeft = previousMarginLeft;
      else workspaceMain.style.removeProperty("margin-left");
    }, { once: true });
    window.print();
  }

  async function exportSeating() {
    if (!draft || !data) return;
    setExporting(true);
    try {
      const { default: writeExcelFile } = await import("write-excel-file/browser");
      const input = {
        rows: draft.rows,
        columns: draft.columns,
        students: data.students,
        assignments: draft.assignments,
        environment: draft.environment,
      };
      const seatMatrix = buildSeatingMatrix(input);
      const seatTracks = getSeatingExportTracks(input);
      const aisleColumnIndexes = new Set(
        seatTracks.flatMap((track, index) => track.type === "AISLE" ? [index + 2] : []),
      );
      const rearRowIndex = seatMatrix.length - 1;
      const seatSheetData = seatMatrix.map((row, rowIndex) => row.map((value, columnIndex) => {
        if (rowIndex < 2) {
          return columnIndex === 0
            ? {
              value,
              columnSpan: row.length,
              align: "center" as const,
              alignVertical: "center" as const,
              fontWeight: rowIndex === 0 ? "bold" as const : undefined,
              fontSize: rowIndex === 0 ? 16 : 10,
              height: rowIndex === 0 ? 28 : 20,
              textColor: rowIndex === 0 ? "#191c1e" : "#5f6368",
            }
            : null;
        }

        if (rowIndex === 2 || rowIndex === rearRowIndex) {
          if (columnIndex === 0 || columnIndex === row.length - 1) {
            return {
              value,
              align: "center" as const,
              alignVertical: "center" as const,
              fontWeight: "bold" as const,
              backgroundColor: "#f1f3f6",
              borderColor: "#bcc5d3",
              borderStyle: "thin" as const,
              height: 24,
            };
          }
          if (columnIndex === 1) {
            return {
              value,
              columnSpan: row.length - 2,
              align: "center" as const,
              alignVertical: "center" as const,
              fontWeight: "bold" as const,
              backgroundColor: rowIndex === 2 ? "#e8eef8" : "#f1f3f6",
              borderColor: "#bcc5d3",
              borderStyle: "thin" as const,
              height: 24,
            };
          }
          return null;
        }

        if (rowIndex === 3) {
          return {
            value,
            align: "center" as const,
            alignVertical: "center" as const,
            fontWeight: "bold" as const,
            backgroundColor: aisleColumnIndexes.has(columnIndex) ? "#e8ebf0" : "#f1f3f6",
            borderColor: "#bcc5d3",
            borderStyle: "thin" as const,
            height: 22,
          };
        }

        return {
          value,
          align: "center" as const,
          alignVertical: "center" as const,
          fontWeight: columnIndex === 1 ? "bold" as const : undefined,
          backgroundColor: aisleColumnIndexes.has(columnIndex) ? "#f7f9fc" : "#ffffff",
          borderColor: "#bcc5d3",
          borderStyle: "thin" as const,
        };
      }));
      const rosterRows = buildSeatingRosterRows(input);
      const rosterSheetData = [
        ["排", "座", "姓名", "状态"].map((value) => ({
          value,
          align: "center" as const,
          fontWeight: "bold" as const,
          backgroundColor: "#f1f3f6",
          borderColor: "#bcc5d3",
          borderStyle: "thin" as const,
        })),
        ...rosterRows.map((row) => [row.排, row.座, row.姓名, row.状态].map((value) => ({
          value,
          align: "center" as const,
          borderColor: "#d7dce5",
          borderStyle: "thin" as const,
        }))),
      ];
      await writeExcelFile([
        {
          data: seatSheetData,
          sheet: "座位表",
          columns: [
            { width: 10 },
            { width: 10 },
            ...seatTracks.map((track) => ({ width: track.type === "AISLE" ? 5 : 14 })),
            { width: 10 },
          ],
          orientation: "landscape",
          stickyRowsCount: 4,
          showGridLines: false,
        },
        {
          data: rosterSheetData,
          sheet: "学生清单",
          columns: [{ width: 8 }, { width: 8 }, { width: 16 }, { width: 12 }],
          stickyRowsCount: 1,
          showGridLines: false,
        },
      ]).toFile(getSeatingExportFilename());
      message.success("座次表 Excel 已导出");
    } catch {
      message.error("Excel 导出失败，请稍后重试");
    } finally {
      setExporting(false);
    }
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
  }

  function placeStudent(studentId: string, row: number, column: number) {
    if (!isEditing || !draft) return;
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
    setSeatActionMenuKey(null);
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

  function seatActionMenuItems(currentStudentId: string): NonNullable<MenuProps["items"]> {
    return [
      { key: "remove-seat", danger: true, label: "移出座位" },
      { type: "divider" },
      ...(data?.students ?? [])
        .filter((student) => student.id !== currentStudentId)
        .map((student) => ({ key: student.id, label: studentDisplayLabel(student) })),
    ];
  }

  function handleSeatActionMenu(row: number, column: number, key: string) {
    if (key === "remove-seat") {
      clearSeat(row, column);
      return;
    }
    changeSeat(row, column, key);
    setSeatActionMenuKey(null);
  }

  function clearSeatLongPressTimer() {
    if (seatLongPressTimer.current !== null) {
      window.clearTimeout(seatLongPressTimer.current);
    }
    seatLongPressTimer.current = null;
    seatLongPressOrigin.current = null;
  }

  function startSeatLongPress(event: React.PointerEvent<HTMLButtonElement>, positionKey: string) {
    if (!isEditing || event.pointerType !== "touch") return;
    clearSeatLongPressTimer();
    suppressNextSeatClick.current = false;
    seatLongPressOrigin.current = { x: event.clientX, y: event.clientY };
    seatLongPressTimer.current = window.setTimeout(() => {
      seatLongPressTimer.current = null;
      seatLongPressOrigin.current = null;
      suppressNextSeatClick.current = true;
      setSeatActionMenuKey(positionKey);
    }, 600);
  }

  function moveSeatLongPress(event: React.PointerEvent<HTMLButtonElement>) {
    const origin = seatLongPressOrigin.current;
    if (!origin || event.pointerType !== "touch") return;
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 12) {
      clearSeatLongPressTimer();
    }
  }

  function endSeatLongPress() {
    clearSeatLongPressTimer();
  }

  function handleSeatStudentClick(event: React.MouseEvent<HTMLButtonElement>) {
    if (suppressNextSeatClick.current) {
      suppressNextSeatClick.current = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    event.stopPropagation();
  }

  function handleSeatStudentContextMenu(event: React.MouseEvent<HTMLButtonElement>, positionKey: string) {
    event.preventDefault();
    event.stopPropagation();
    clearSeatLongPressTimer();
    setSeatActionMenuKey(positionKey);
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

  function startStudentPoolDrag(event: React.PointerEvent<HTMLElement>) {
    const panel = event.currentTarget.closest<HTMLElement>(".seating-sidebar-floating");
    if (!panel) return;

    const panelRect = panel.getBoundingClientRect();
    studentPoolDrag.current = {
      panel,
      offsetX: event.clientX - panelRect.left,
      offsetY: event.clientY - panelRect.top,
    };
    setDraggingStudentPool(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveStudentPool(event: React.PointerEvent<HTMLElement>) {
    const drag = studentPoolDrag.current;
    if (!drag) return;

    setStudentPoolPosition(clampFloatingPanelPosition(drag.panel, {
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }));
  }

  function endStudentPoolDrag(event: React.PointerEvent<HTMLElement>) {
    studentPoolDrag.current = null;
    setDraggingStudentPool(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function moveStudentPoolBy(horizontal: number, vertical: number) {
    const panel = studentPoolPanelRef.current;
    if (!panel) return;
    const panelRect = panel.getBoundingClientRect();
    const current = studentPoolPosition ?? {
      x: panelRect.left,
      y: panelRect.top,
    };
    setStudentPoolPosition(clampFloatingPanelPosition(panel, {
      x: current.x + horizontal,
      y: current.y + vertical,
    }));
  }

  function handleStudentPoolHandleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 24 : 8;
    const movements: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const movement = movements[event.key];
    if (!movement) return;
    event.preventDefault();
    moveStudentPoolBy(...movement);
  }

  function setSideFeature(side: SideKey, row: number, feature: SideFeature | null) {
    if (!isEditing || !draft) return;
    const environment = cloneEnvironment(draft.environment);
    const currentSide = environment[side];
    const nextSide: SeatingSideLayout = {
      windows: currentSide.windows.filter((item) => item !== row),
      doorRows: currentSide.doorRows.filter((item) => item !== row),
    };
    if (feature === "WINDOW") nextSide.windows.push(row);
    if (feature === "DOOR") {
      if (nextSide.doorRows.length >= MAX_DOORS_PER_SIDE) {
        message.warning(`每侧最多设置 ${MAX_DOORS_PER_SIDE} 个门口`);
        return;
      }
      nextSide.doorRows.push(row);
    }
    nextSide.windows.sort((left, right) => left - right);
    nextSide.doorRows.sort((left, right) => left - right);
    commitDraft({ ...draft, environment: { ...environment, [side]: nextSide } });
  }

  function cycleSideFeature(side: SideKey, row: number) {
    if (!draft) return;
    const currentFeature = sideFeatureForRow(draft.environment[side], row);
    if (currentFeature === null) {
      setSideFeature(side, row, "WINDOW");
      return;
    }
    if (currentFeature === "WINDOW") {
      if (draft.environment[side].doorRows.length >= MAX_DOORS_PER_SIDE) {
        message.warning(`每侧最多设置 ${MAX_DOORS_PER_SIDE} 个门口`);
        return;
      }
      setSideFeature(side, row, "DOOR");
      return;
    }
    setSideFeature(side, row, null);
  }

  function updatePendingDimensions(next: Partial<Pick<PendingDimensions, "rows" | "columns">>) {
    const nextRows = next.rows ?? pendingDimensions.rows;
    const nextColumns = next.columns ?? pendingDimensions.columns;
    const environment = cloneEnvironment(pendingDimensions.environment);
    dispatch({
      type: "setPendingDimensions",
      dimensions: {
        rows: nextRows,
        columns: nextColumns,
        environment,
      },
    });
  }

  function openLayoutSettings() {
    if (!draft) return;
    dispatch({ type: "setPendingDimensions", dimensions: pendingDimensionsFor(draft) });
    setLayoutSettingsModalOpen(true);
  }

  function cancelLayoutSettings() {
    if (draft) dispatch({ type: "setPendingDimensions", dimensions: pendingDimensionsFor(draft) });
    setLayoutSettingsModalOpen(false);
  }

  function applyDimensions() {
    if (!isEditing || !draft) return;
    const nextRows = pendingDimensions.rows;
    const nextColumns = pendingDimensions.columns;
    const nextEnvironment = cloneEnvironment(pendingDimensions.environment);
    if (
      nextRows === draft.rows
      && nextColumns === draft.columns
      && environmentsEqual(nextEnvironment, draft.environment)
    ) {
      setLayoutSettingsModalOpen(false);
      return;
    }

    const displacedAssignments = draft.assignments.filter(
      (assignment) => assignment.row > nextRows
        || assignment.column > nextColumns,
    );
    const apply = () => {
      commitDraft({
        ...draft,
        rows: nextRows,
        columns: nextColumns,
        assignments: draft.assignments.filter((assignment) => !displacedAssignments.includes(assignment)),
        environment: nextEnvironment,
      });
      setSelectedStudentId(null);
      setLayoutSettingsModalOpen(false);
    };

    if (displacedAssignments.length) {
      const details = [
        displacedAssignments.length ? `${displacedAssignments.length} 位学生将回到待安排` : "",
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

  function openAisleSettings() {
    if (!draft) return;
    dispatch({ type: "setPendingDimensions", dimensions: pendingDimensionsFor(draft) });
    setAisleSettingsModalOpen(true);
  }

  function cancelAisleSettings() {
    if (draft) dispatch({ type: "setPendingDimensions", dimensions: pendingDimensionsFor(draft) });
    setAisleSettingsModalOpen(false);
  }

  function updatePendingAisles(values: readonly unknown[]) {
    const environment = cloneEnvironment(pendingDimensions.environment);
    const outOfRangeAisles = environment.aisleAfterColumns.filter(
      (column) => column >= pendingDimensions.columns,
    );
    const selectedAisles = values.map((value) => Number(value))
      .filter((column) => Number.isInteger(column) && column >= 1 && column < pendingDimensions.columns);
    environment.aisleAfterColumns = [...new Set([
      ...outOfRangeAisles,
      ...selectedAisles,
    ])]
      .sort((left, right) => left - right);
    dispatch({
      type: "setPendingDimensions",
      dimensions: { ...pendingDimensions, environment },
    });
  }

  function applyAisleSettings() {
    if (!isEditing || !draft) return;
    const environment = cloneEnvironment(pendingDimensions.environment);
    if (sameNumberList(environment.aisleAfterColumns, draft.environment.aisleAfterColumns)) {
      setAisleSettingsModalOpen(false);
      return;
    }
    commitDraft({ ...draft, environment });
    setAisleSettingsModalOpen(false);
  }

  async function saveLayout() {
    if (!draft) return;
    if (!data?.revision) {
      message.error("座次版本信息缺失，请刷新页面后再保存");
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/seating", {
        method: "PUT",
        body: JSON.stringify({
          revision: data.revision,
          rows: draft.rows,
          columns: draft.columns,
          assignments: draft.assignments,
          environment: draft.environment,
        }),
      });
      message.success("座次与教室标记已保存");
      setIsEditing(false);
      setStudentPoolPosition(null);
      closeStudentPool();
      setSelectedStudentId(null);
      setDropTarget(null);
      setSeatActionMenuKey(null);
      await refresh();
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function renderSideRail(side: SideKey) {
    if (!draft) return null;
    return (
      <div className="room-side-column">
        <div className="room-column-label">{sideLabels[side]}</div>
        <div
          className="room-side-track"
          style={{ gridTemplateRows: `repeat(${DEFAULT_SEATING_SIDE_MARKER_ROWS}, minmax(96px, 1fr))` }}
        >
          {Array.from({ length: DEFAULT_SEATING_SIDE_MARKER_ROWS }, (_, index) => {
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
                  data-side={side}
                  data-marker-row={row}
                  aria-label={`${sideLabels[side]}第 ${row} 排，${feature ? featureLabels[feature] : "未设置"}`}
                >
                  {markerContent}
                </div>
              );
            }

            return (
              <button
                type="button"
                key={`${side}-${row}`}
                className={markerClass}
                data-side={side}
                data-marker-row={row}
                aria-label={`${sideLabels[side]}第 ${row} 排，${feature ? featureLabels[feature] : "未设置"}。点击切换标记`}
                title={feature === null ? "添加窗户" : feature === "WINDOW" ? "改为门口" : "移除门口"}
                onClick={() => cycleSideFeature(side, row)}
              >
                {markerContent}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  function renderBackRail() {
    if (!draft) return null;
    return (
      <div className="room-back" data-orientation="rear" aria-label="后方固定边界">
        <div className="room-end-label">
          <strong>后方</strong>
          <small>固定</small>
        </div>
        <div className="room-back-boundary">
          <span className="room-back-boundary-line" aria-hidden="true" />
          <span>后侧固定</span>
        </div>
        <span className="room-end-hint">教室后墙</span>
      </div>
    );
  }

  return (
    <>
      <LedgerSheet
        kicker="SEATING PLAN"
        title="班级座次表"
        description={isEditing ? "编辑模式：拖动学生或选择目标座位，完成后保存座次。" : "面向讲台查看教室布局，座次仅在编辑模式下可以调整。"}
        actions={(
          <Space className="seating-heading-actions">
            <Space className="seating-output-actions" size={8}>
              <Tooltip title={isDirty ? "打印当前座位图（含未保存修改）" : "打印当前座位图"}>
                <Button
                  type="text"
                  icon={<PrinterOutlined />}
                  aria-label="打印座位图"
                  disabled={!draft || saving || exporting}
                  onClick={printSeating}
                />
              </Tooltip>
              <Tooltip title={isDirty ? "导出当前座次（含未保存修改）" : "导出当前座次"}>
                <Button
                  type="text"
                  icon={<FileExcelOutlined />}
                  aria-label="导出 Excel"
                  loading={exporting}
                  disabled={!draft || saving}
                  onClick={() => void exportSeating()}
                />
              </Tooltip>
            </Space>
            {!isEditing ? (
              <Button type="primary" icon={<EditOutlined />} onClick={enterEditing}>
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
        metrics={[
          { label: "SEATS // 已安排", value: draft ? assignedCount : "—", unit: "席", detail: draft ? `共 ${studentCount} 名学生` : "正在读取座次", icon: <TeamOutlined /> },
          { label: "CAPACITY // 座位容量", value: draft ? draft.rows * draft.columns : "—", unit: "席", detail: draft ? `${draft.rows} 排 × ${draft.columns} 列` : "等待布局", icon: <ColumnWidthOutlined /> },
          { label: "ROOM // 环境标记", value: draft ? environmentFeatureCount : "—", unit: "项", detail: draft ? `过道 ${aisleAfterColumns.length} 条` : "等待教室配置", icon: <SettingOutlined /> },
        ]}
      >
      {error && <Alert type="error" showIcon title={error.message} />}
      {loading || !data || !draft ? (
        <div className="seating-loading-card">
          <Skeleton active paragraph={{ rows: 12 }} />
        </div>
      ) : (
        <div className="seating-workspace-card">
          <div
            className={`seating-workspace-body ${isEditing ? "seating-workspace-body-editing" : "seating-workspace-body-view"}`}
          >
            {isEditing && <aside
              ref={studentPoolPanelRef}
              className={`seating-sidebar seating-sidebar-floating ${studentPoolOpen ? "seating-sidebar-floating-open" : "seating-sidebar-floating-collapsed"} ${studentPoolPosition ? "seating-sidebar-floating-positioned" : ""} ${draggingStudentPool ? "seating-sidebar-floating-dragging" : ""}`}
              style={studentPoolPosition ? { left: `${studentPoolPosition.x}px`, top: `${studentPoolPosition.y}px` } : undefined}
              aria-label="待安排学生"
            >
              <div className="student-pool-floating-header">
                <Tooltip title="拖动学生池">
                  <button
                    type="button"
                    className="seating-sidebar-floating-handle"
                    aria-label="拖动学生池位置"
                    onPointerDown={startStudentPoolDrag}
                    onPointerMove={moveStudentPool}
                    onPointerUp={endStudentPoolDrag}
                    onPointerCancel={endStudentPoolDrag}
                    onKeyDown={handleStudentPoolHandleKeyDown}
                  >
                    <HolderOutlined />
                  </button>
                </Tooltip>
                <button
                  type="button"
                  className="student-pool-toggle"
                  aria-label={studentPoolOpen ? "收起学生池" : "打开学生池"}
                  aria-expanded={studentPoolOpen}
                  aria-describedby="student-pool-unassigned-count"
                  onClick={toggleStudentPool}
                >
                  <TeamOutlined />
                  <span className="student-pool-toggle-copy">
                    <strong>学生池</strong>
                    <small>{studentCount} 人</small>
                  </span>
                  <span
                    id="student-pool-unassigned-count"
                    className={`student-pool-unassigned-badge ${unassignedStudentCount > 0 ? "student-pool-unassigned-badge-active" : ""}`}
                  >
                    <strong>{unassignedStudentCount}</strong>
                    <small>未分配</small>
                  </span>
                </button>
                {studentPoolOpen && (
                  <Tooltip title="收起学生池">
                    <button
                      type="button"
                      className="student-pool-close"
                      aria-label="收起学生池"
                      onClick={closeStudentPool}
                    >
                      <CloseOutlined />
                    </button>
                  </Tooltip>
                )}
              </div>
              {studentPoolOpen && (
                <>
                  <div
                    className={`student-pool-summary ${unassignedStudentCount > 0 ? "student-pool-summary-active" : ""}`}
                    role="status"
                    aria-label={`${unassignedStudentCount} 名学生未分配，${assignedCount} 名学生已安排`}
                  >
                    <div className="student-pool-summary-primary">
                      <span>待安排</span>
                      <strong>{unassignedStudentCount}</strong>
                      <small>人</small>
                    </div>
                    <span className="student-pool-summary-secondary">已安排 {assignedCount}</span>
                  </div>
                  <Input
                    className="student-pool-search"
                    size="small"
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="搜索学生"
                    aria-label="搜索学生"
                    value={studentPoolQuery}
                    onChange={(event) => setStudentPoolQuery(event.target.value)}
                  />
                  <div
                    className={`student-pool-list ${draggingStudentId ? "student-pool-list-drop-active" : ""}`}
                    onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; }}
                    onDrop={handlePoolDrop}
                  >
                    {filteredPoolStudents.map((student, index) => {
                      const isSelected = selectedStudentId === student.id;
                      const isAssigned = assignmentByStudent.has(student.id);
                      const previousStudent = filteredPoolStudents[index - 1];
                      const previousIsAssigned = previousStudent
                        ? assignmentByStudent.has(previousStudent.id)
                        : null;
                      const showGroupLabel = previousIsAssigned === null || previousIsAssigned !== isAssigned;
                      return (
                        <Fragment key={student.id}>
                          {showGroupLabel && (
                            <div className="student-pool-group-label">
                              <span>{isAssigned ? "已安排" : "未分配"}</span>
                              <small>{isAssigned ? assignedCount : unassignedStudentCount} 人</small>
                            </div>
                          )}
                          <button
                            type="button"
                            className={`student-pool-item ${isSelected ? "student-pool-item-selected" : ""} ${draggingStudentId === student.id ? "student-pool-item-dragging" : ""} ${isAssigned ? "" : "student-pool-item-unassigned"}`}
                            data-assigned={isAssigned ? "true" : "false"}
                            aria-label={`${student.name}，${isAssigned ? "已安排" : "未分配"}，拖动到座位`}
                            draggable
                            aria-pressed={isSelected}
                            onClick={() => selectStudent(student.id)}
                            onDragStart={(event) => startStudentDrag(event, student.id)}
                            onDragEnd={() => { setDraggingStudentId(null); setDropTarget(null); }}
                          >
                            <span className="student-pool-copy"><strong>{student.name}</strong></span>
                            <span className={`student-pool-item-status ${isAssigned ? "student-pool-item-status-assigned" : "student-pool-item-status-unassigned"}`}>
                              {isAssigned ? "已安排" : "未分配"}
                            </span>
                          </button>
                        </Fragment>
                      );
                    })}
                    {!filteredPoolStudents.length && (
                      <span className="student-pool-empty">没有匹配的学生</span>
                    )}
                  </div>
                </>
              )}
            </aside>}

            <section
              ref={studentPoolCanvasRef}
              className="seating-canvas-section seating-print-region"
              aria-label="教室座位画布"
              style={{ "--room-center-min-width": `${seatGridMinimumWidth}px` } as CSSProperties}
            >
              <div className="seating-print-header" aria-hidden="true">
                <strong>班级座次表</strong>
                <span>{isDirty ? "含未保存修改 · " : ""}面向讲台 · {draft.rows} 排 · {draft.columns} 个座位/排</span>
              </div>
              <div className="seating-canvas-toolbar">
                <div className="seating-canvas-summary">
                  <strong>座位编辑画布</strong>
                  <Tag color={isEditing ? (isDirty ? "orange" : "blue") : "green"}>
                    {isEditing ? (isDirty ? "有未保存修改" : "编辑中") : "查看模式"}
                  </Tag>
                  <span className="seating-canvas-dimensions">面向讲台 · {draft.rows} 排 · {draft.columns} 个座位/排</span>
                  <div className="seating-inline-stats" aria-label="座位统计">
                    <span className="seating-inline-stat">已安排 <strong>{assignedCount}<small> / {studentCount}</small></strong></span>
                    <span className="seating-inline-stat">空座位 <strong>{Math.max(availableSeatCount, 0)}</strong></span>
                    <span className="seating-inline-stat">教室标记 <strong>{environmentFeatureCount}<small> 个</small></strong></span>
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
                <div className="seating-canvas-options">
                  {isEditing && <Space className="seating-settings-actions">
                    <Button
                      className="seating-settings-button"
                      icon={<SettingOutlined />}
                      onClick={openLayoutSettings}
                    >
                      座位布局
                    </Button>
                    <Button
                      className="seating-settings-button"
                      icon={<ColumnWidthOutlined />}
                      onClick={openAisleSettings}
                    >
                      过道设置
                    </Button>
                  </Space>}
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
                  <span><ColumnWidthOutlined />过道 {aisleAfterColumns.length}</span>
                  {isEditing && <><span><WindowsOutlined />窗户</span><span><LoginOutlined />门口</span></>}
                  </div>
                </div>
              </div>

              <div className="seating-map-scroll">
                <div className="seating-map">
                  <div className="room-front" data-orientation="front">
                    <span className="room-end-label"><strong>前方</strong><small>固定</small></span>
                    <div className="blackboard"><strong>讲台</strong><small>BLACKBOARD</small></div>
                    <span className="room-end-hint">面向讲台</span>
                  </div>
                  <div className={`room-layout ${showLeftSide ? "" : "room-layout-no-left"} ${showRightSide ? "" : "room-layout-no-right"}`}>
                    {showLeftSide && renderSideRail("left")}
                    <div className="room-center-column">
                      <div className="room-column-label">座位区</div>
                      <div className="seat-grid" style={{ gridTemplateColumns: seatGridTemplate }}>
                        {Array.from({ length: draft.rows }, (_, rowIndex) => {
                          const row = rowIndex + 1;
                          return (
                            <Fragment key={`row-${row}`}>
                              {Array.from({ length: draft.columns }, (_, columnIndex) => {
                                const column = columnIndex + 1;
                                const assignment = assignmentByPosition.get(`${row}-${column}`);
                                const student = assignment ? studentById.get(assignment.studentId) : undefined;
                                const positionKey = `${row}-${column}`;
                                const isTarget = dropTarget === positionKey;
                                return (
                                  <Fragment key={positionKey}>
                                    <div
                                      className={`seat-cell ${student ? "seat-cell-filled" : "seat-cell-empty"} ${isEditing ? "seat-cell-editable" : "seat-cell-readonly"} ${isTarget ? "seat-cell-drop-target" : ""}`}
                                      data-seat-row={row}
                                      data-seat-column={column}
                                      onClick={isEditing ? () => handleSeatClick(row, column) : undefined}
                                      onDragEnter={isEditing ? () => setDropTarget(positionKey) : undefined}
                                      onDragOver={isEditing ? (event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(positionKey); } : undefined}
                                      onDragLeave={isEditing ? () => setDropTarget((current) => current === positionKey ? null : current) : undefined}
                                      onDrop={isEditing ? (event) => handleSeatDrop(event, row, column) : undefined}
                                    >
                                      {student ? (
                                        <div className="seat-student-row">
                                          {isEditing ? (
                                            <Dropdown
                                              trigger={["click"]}
                                              open={seatActionMenuKey === positionKey}
                                              onOpenChange={(open) => setSeatActionMenuKey(open ? positionKey : null)}
                                              menu={{
                                                items: seatActionMenuItems(student.id),
                                                onClick: ({ key }) => handleSeatActionMenu(row, column, String(key)),
                                              }}
                                              classNames={{ root: "seat-replacement-menu" }}
                                            >
                                              <button
                                                type="button"
                                                className={`seat-student ${studentToneClass(student)} ${selectedStudentId === student.id ? "seat-student-selected" : ""}`}
                                                draggable
                                                aria-label={`第 ${row} 排 ${column} 座，${student.name}。打开座位操作`}
                                                aria-haspopup="menu"
                                                onClick={handleSeatStudentClick}
                                                onKeyDown={(event) => {
                                                  if (event.key !== "Escape") return;
                                                  event.preventDefault();
                                                  setSeatActionMenuKey(null);
                                                }}
                                                onContextMenu={(event) => handleSeatStudentContextMenu(event, positionKey)}
                                                onPointerDown={(event) => startSeatLongPress(event, positionKey)}
                                                onPointerMove={moveSeatLongPress}
                                                onPointerUp={endSeatLongPress}
                                                onPointerCancel={endSeatLongPress}
                                                onPointerLeave={endSeatLongPress}
                                                onDragStart={(event) => { setSeatActionMenuKey(null); startStudentDrag(event, student.id); }}
                                                onDragEnd={() => { setDraggingStudentId(null); setDropTarget(null); }}
                                              >
                                                <span className="seat-student-copy"><strong className="seat-student-name" title={student.name}>{student.name}</strong></span>
                                              </button>
                                            </Dropdown>
                                          ) : (
                                            <div className={`seat-student seat-student-readonly ${studentToneClass(student)}`} aria-label={`${row}排${column}座，${student.name}`}>
                                              <span className="seat-student-copy"><strong className="seat-student-name" title={student.name}>{student.name}</strong></span>
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <div className="seat-empty-editor">
                                          <div className="seat-empty-trigger">
                                            <DragOutlined />
                                            <span>{isEditing ? "选择学生" : "空座"}</span>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    {isSeatingAisleAfterColumn(column, draft.columns, aisleAfterColumns) && (
                                      <div className="seat-aisle" aria-hidden="true">
                                        {row === 1 && <span>过道</span>}
                                      </div>
                                    )}
                                  </Fragment>
                                );
                              })}
                            </Fragment>
                          );
                        })}
                      </div>
                    </div>
                    {showRightSide && renderSideRail("right")}
                  </div>
                  {renderBackRail()}
                </div>
              </div>
            </section>
          </div>

          {isEditing && <div className="seating-workspace-footer">
            <Space size={6}><SwapOutlined /><span>拖动已安排学生到其他座位可直接交换；拖回学生池即可取消安排。</span></Space>
            <span className="seating-footer-capacity">座位容量 {draft.rows * draft.columns} · 当前安排 {assignedCount}</span>
          </div>}
        </div>
      )}
      </LedgerSheet>
      <Modal
        className="seating-settings-modal"
        title="座位布局"
        open={layoutSettingsModalOpen}
        width={560}
        destroyOnHidden
        onCancel={cancelLayoutSettings}
        onOk={applyDimensions}
        okText="应用设置"
        cancelText="取消"
      >
        {draft && (
          <div className="seating-settings-content">
            <section className="seating-settings-section">
              <div className="seating-settings-section-heading">
                <div>
                  <h3>座位布局</h3>
                  <p>调整座位排数与列数，过道设置保持独立。</p>
                </div>
                <Tag>{pendingDimensions.rows} × {pendingDimensions.columns}</Tag>
              </div>
              <div className="seating-settings-dimensions">
                <label>
                  <span>排数</span>
                  <InputNumber
                    min={1}
                    max={12}
                    value={pendingDimensions.rows}
                    onChange={(value) => updatePendingDimensions({ rows: value ?? pendingDimensions.rows })}
                    controls
                  />
                </label>
                <label>
                  <span>列数</span>
                  <InputNumber
                    min={1}
                    max={12}
                    value={pendingDimensions.columns}
                    onChange={(value) => updatePendingDimensions({ columns: value ?? pendingDimensions.columns })}
                    controls
                  />
                </label>
              </div>
              <div className="seating-settings-capacity">
                <span>可用座位</span>
                <strong>{pendingDimensions.rows * pendingDimensions.columns} 个</strong>
              </div>
            </section>
          </div>
        )}
      </Modal>
      <Modal
        className="seating-settings-modal"
        title="过道设置"
        open={aisleSettingsModalOpen}
        width={560}
        destroyOnHidden
        onCancel={cancelAisleSettings}
        onOk={applyAisleSettings}
        okText="应用过道"
        cancelText="取消"
      >
        {draft && (
          <div className="seating-settings-content">
            <section className="seating-settings-section">
              <div className="seating-settings-section-heading">
                <div>
                  <h3>过道插入位置</h3>
                  <p>过道插入在指定座位列之后，不占用座位列。</p>
                </div>
                <Tag>{pendingDimensions.environment.aisleAfterColumns.filter((column) => column < pendingDimensions.columns).length} 条</Tag>
              </div>
              <div className="seating-aisle-options">
                <Checkbox.Group
                  value={pendingDimensions.environment.aisleAfterColumns.filter(
                    (column) => column >= 1 && column < pendingDimensions.columns,
                  )}
                  options={Array.from({ length: Math.max(pendingDimensions.columns - 1, 0) }, (_, index) => {
                    const column = index + 1;
                    return { label: `第 ${column} 列后`, value: column };
                  })}
                  onChange={updatePendingAisles}
                />
              </div>
              <div className="seating-settings-capacity">
                <span>座位容量</span>
                <strong>{pendingDimensions.rows * pendingDimensions.columns} 个</strong>
                <small>当前绘制 {pendingDimensions.environment.aisleAfterColumns.filter((column) => column < pendingDimensions.columns).length} 条过道</small>
              </div>
            </section>
          </div>
        )}
      </Modal>
    </>
  );
}
