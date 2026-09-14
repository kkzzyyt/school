"use client";

import {
  ApartmentOutlined,
  CloseOutlined,
  ColumnWidthOutlined,
  DeleteOutlined,
  DragOutlined,
  EditOutlined,
  FileExcelOutlined,
  LockOutlined,
  LoginOutlined,
  PlusOutlined,
  PrinterOutlined,
  RedoOutlined,
  RollbackOutlined,
  SearchOutlined,
  SaveOutlined,
  SettingOutlined,
  SwapOutlined,
  SyncOutlined,
  TeamOutlined,
  UndoOutlined,
  UserAddOutlined,
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
  Segmented,
  Skeleton,
  Space,
  Tag,
  Tooltip,
} from "antd";
import type { MenuProps } from "antd";
import { Fragment, type CSSProperties, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { LedgerSheet } from "@/components/layout/LedgerSheet";
import { SeatingSchemeModal } from "@/components/seating/SeatingSchemeModal";
import {
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ENVIRONMENT,
  DEFAULT_SEATING_ROWS,
  MAX_DOORS_PER_SIDE,
  createDefaultSeatingEnvironment,
  getSeatingAisleAfterColumns,
  isSeatingAisleAfterColumn,
  type SeatingEnvironment,
  type SeatingSideLayout,
} from "@/domain/seating";
import {
  DEFAULT_ROTATION_SCHEME,
  PRESET_ROTATION_SCHEMES,
  rotateSeatAssignments,
  seatKey,
  type SeatingRotationScheme,
} from "@/domain/seating-rotation";
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
  className?: string;
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
    ...(environment.disabledSeats ? { disabledSeats: environment.disabledSeats.map((s) => ({ ...s })) } : {}),
    ...(environment.lockedSeats ? { lockedSeats: environment.lockedSeats.map((s) => ({ ...s })) } : {}),
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
  const podiumPosition: "TOP" | "BOTTOM" = "BOTTOM";
  const mirrorColumns = true;
  const [layoutSettingsModalOpen, setLayoutSettingsModalOpen] = useState(false);
  const titleClickCountRef = useRef(0);
  const titleClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleTitleClick() {
    titleClickCountRef.current += 1;
    if (titleClickTimerRef.current) {
      clearTimeout(titleClickTimerRef.current);
    }

    if (titleClickCountRef.current >= 5) {
      titleClickCountRef.current = 0;
      if (!isEditing) {
        enterEditing();
      }
      openLayoutSettings();
      return;
    }

    titleClickTimerRef.current = setTimeout(() => {
      titleClickCountRef.current = 0;
    }, 2500);
  }
  const [schemeModalOpen, setSchemeModalOpen] = useState(false);
  const [replaceModalTarget, setReplaceModalTarget] = useState<{
    row: number;
    column: number;
    currentStudent: Student | null;
  } | null>(null);
  const [replaceSearchQuery, setReplaceSearchQuery] = useState("");
  const [replaceGenderFilter, setReplaceGenderFilter] = useState<"ALL" | "MALE" | "FEMALE">("ALL");
  const [seatActionMenuKey, setSeatActionMenuKey] = useState<string | null>(null);

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

  useEffect(() => {
    if (!isEditing) return;
    const handleUndoRedoKeys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.platform);
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (!modifier || event.altKey) return;

      if (event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) {
          if (editor.future.length > 0) {
            dispatch({ type: "redo" });
            setSelectedStudentId(null);
          }
        } else {
          if (editor.past.length > 0) {
            dispatch({ type: "undo" });
            setSelectedStudentId(null);
          }
        }
      } else if (event.key.toLowerCase() === "y" && !isMac) {
        event.preventDefault();
        if (editor.future.length > 0) {
          dispatch({ type: "redo" });
          setSelectedStudentId(null);
        }
      }
    };
    window.addEventListener("keydown", handleUndoRedoKeys);
    return () => window.removeEventListener("keydown", handleUndoRedoKeys);
  }, [isEditing, editor.past.length, editor.future.length]);

  const draft = editor.draft;
  const disabledSeatKeys = useMemo(() => {
    const set = new Set<string>();
    for (const seat of draft?.environment.disabledSeats ?? []) {
      set.add(seatKey(seat.row, seat.column));
    }
    return set;
  }, [draft?.environment.disabledSeats]);
  const lockedSeatKeys = useMemo(() => {
    const set = new Set<string>();
    for (const seat of draft?.environment.lockedSeats ?? []) {
      set.add(seatKey(seat.row, seat.column));
    }
    return set;
  }, [draft?.environment.lockedSeats]);
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
  const orderedRows = useMemo(() => {
    const rows = draft?.rows ?? DEFAULT_SEATING_ROWS;
    if (podiumPosition === "BOTTOM") {
      return Array.from({ length: rows }, (_, index) => rows - index);
    }
    return Array.from({ length: rows }, (_, index) => index + 1);
  }, [draft?.rows, podiumPosition]);

  const orderedColumns = useMemo(() => {
    const cols = draft?.columns ?? DEFAULT_SEATING_COLUMNS;
    if (mirrorColumns) {
      return Array.from({ length: cols }, (_, index) => cols - index);
    }
    return Array.from({ length: cols }, (_, index) => index + 1);
  }, [draft?.columns, mirrorColumns]);


  const seatGridTemplate = useMemo(
    () => orderedColumns.map((column) => {
      const hasAisle = mirrorColumns
        ? aisleAfterColumns.includes(column - 1)
        : aisleAfterColumns.includes(column);
      return [
        `minmax(var(--seat-grid-min-seat-width, ${seatGridMinimumSeatWidth}px), 1fr)`,
        ...(hasAisle ? [`${seatGridAisleWidth}px`] : []),
      ];
    }).flat().join(" "),
    [aisleAfterColumns, mirrorColumns, orderedColumns],
  );
  const seatGridMinimumWidth = useMemo(() => {
    const seatColumnCount = draft?.columns ?? DEFAULT_SEATING_COLUMNS;
    const gridTrackCount = seatColumnCount + aisleAfterColumns.length;
    return seatColumnCount * seatGridMinimumSeatWidth
      + aisleAfterColumns.length * seatGridAisleWidth
      + Math.max(0, gridTrackCount - 1) * seatGridGap;
  }, [aisleAfterColumns.length, draft?.columns]);
  const assignedCount = draft?.assignments.length ?? 0;
  const studentCount = data?.students.length ?? 0;
  const unassignedStudentCount = data?.students.filter((student) => !assignmentByStudent.has(student.id)).length ?? 0;
  const isDirty = Boolean(draft && savedDraft && !draftsEqual(draft, savedDraft));

  const pageTitle = useMemo(() => {
    const rawClass = data?.className?.trim();
    if (!rawClass) return "班级座次表";
    return rawClass.endsWith("班") ? `${rawClass}座次表` : `${rawClass}班座次表`;
  }, [data?.className]);

  function enterEditing() {
    setIsEditing(true);
  }

  function leaveEditing() {
    if (!isDirty) {
      setIsEditing(false);
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
        className: data.className,
        rows: draft.rows,
        columns: draft.columns,
        students: data.students,
        assignments: draft.assignments,
        environment: draft.environment,
        podiumPosition,
        mirrorColumns,
      };
      const seatMatrix = buildSeatingMatrix(input);
      const originalTracks = getSeatingExportTracks(input);
      const seatTracks = mirrorColumns ? [...originalTracks].reverse() : originalTracks;
      const aisleColumnIndexes = new Set(
        seatTracks.flatMap((track, index) => track.type === "AISLE" ? [index + 2] : []),
      );
      const seatSheetData = seatMatrix.map((row, rowIndex) => row.map((value, columnIndex) => {
        if (rowIndex === 0) {
          return columnIndex === 0
            ? {
              value,
              columnSpan: row.length,
              align: "center" as const,
              alignVertical: "center" as const,
              fontWeight: "bold" as const,
              fontSize: 16,
              height: 34,
              textColor: "#0f2942",
              backgroundColor: "#f8fafc",
            }
            : null;
        }

        const isHeaderRow = row[1] === "排\\座";
        const isPodiumRow = typeof row[1] === "string" && row[1].startsWith("讲台");
        const isBackRow = typeof row[1] === "string" && row[1].startsWith("教室后墙");

        if (isHeaderRow) {
          // 表头行
          const isSideCol = columnIndex === 0 || columnIndex === row.length - 1;
          return {
            value,
            align: "center" as const,
            alignVertical: "center" as const,
            fontWeight: "bold" as const,
            fontSize: 11,
            backgroundColor: isSideCol ? "#f8fafc" : aisleColumnIndexes.has(columnIndex) ? "#f1f5f9" : "#e2e8f0",
            textColor: "#1e293b",
            borderColor: isSideCol && !value ? "#e2e8f0" : "#cbd5e1",
            borderStyle: "thin" as const,
            height: 26,
          };
        }

        if (isPodiumRow) {
          // 讲台行：居中合并展示
          if (columnIndex === 1) {
            return {
              value: row[1] === "讲台" ? "【 讲 台 】" : `【 ${row[1]} 】`,
              columnSpan: row.length - 2,
              align: "center" as const,
              alignVertical: "center" as const,
              fontWeight: "bold" as const,
              fontSize: 12,
              backgroundColor: "#e0f2fe",
              textColor: "#0369a1",
              borderColor: "#7dd3fc",
              borderStyle: "thin" as const,
              height: 28,
            };
          }
          if (columnIndex === 0 || columnIndex === row.length - 1) {
            return {
              value: "",
              align: "center" as const,
              alignVertical: "center" as const,
              backgroundColor: "#ffffff",
              borderColor: "#e2e8f0",
              borderStyle: "thin" as const,
              height: 28,
            };
          }
          return null;
        }

        if (isBackRow) {
          // 后方设施行（仅当存在后方设施时展示）
          if (columnIndex === 1) {
            return {
              value: row[1],
              columnSpan: row.length - 2,
              align: "center" as const,
              alignVertical: "center" as const,
              fontSize: 10,
              backgroundColor: "#f8fafc",
              textColor: "#64748b",
              borderColor: "#e2e8f0",
              borderStyle: "thin" as const,
              height: 22,
            };
          }
          return null;
        }

        // 座位数据行
        const isSideCol = columnIndex === 0 || columnIndex === row.length - 1;
        const isRowLabel = columnIndex === 1;
        const isAisle = aisleColumnIndexes.has(columnIndex);
        const hasStudent = Boolean(value) && !isSideCol && !isRowLabel && !isAisle;

        let bgColor = "#ffffff";
        let textColor = "#0f172a";
        let borderColor = "#e2e8f0";

        if (isRowLabel) {
          bgColor = "#f8fafc";
          textColor = "#334155";
          borderColor = "#cbd5e1";
        } else if (isAisle) {
          bgColor = "#f8fafc";
          borderColor = "#f1f5f9";
        } else if (isSideCol) {
          if (value.includes("门")) {
            bgColor = "#fffbeb";
            textColor = "#92400e";
            borderColor = "#fde68a";
          } else if (value.includes("窗")) {
            bgColor = "#f0fdf4";
            textColor = "#166534";
            borderColor = "#bbf7d0";
          } else {
            bgColor = "#ffffff";
            borderColor = "#f1f5f9";
          }
        } else if (hasStudent) {
          borderColor = "#94a3b8";
        }

        return {
          value,
          align: "center" as const,
          alignVertical: "center" as const,
          fontWeight: (isRowLabel || hasStudent) ? "bold" as const : undefined,
          fontSize: isSideCol ? 10 : 11,
          backgroundColor: bgColor,
          textColor,
          borderColor,
          borderStyle: "thin" as const,
          height: 26,
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
          stickyRowsCount: 2,
          showGridLines: false,
        },
        {
          data: rosterSheetData,
          sheet: "学生清单",
          columns: [{ width: 8 }, { width: 8 }, { width: 16 }, { width: 12 }],
          stickyRowsCount: 1,
          showGridLines: false,
        },
      ]).toFile(getSeatingExportFilename(new Date(), data.className));
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
    } else {
      // 点击空座：直接打开安排学生弹窗
      setReplaceModalTarget({ row, column, currentStudent: null });
      setReplaceSearchQuery("");
      setReplaceGenderFilter("ALL");
    }
  }

  function changeSeat(row: number, column: number, studentId?: string) {
    if (!isEditing) return;
    if (studentId) placeStudent(studentId, row, column);
    else clearSeat(row, column);
  }

  function toggleSeatLock(row: number, column: number) {
    if (!isEditing || !draft) return;
    const currentLocked = draft.environment.lockedSeats ?? [];
    const exists = currentLocked.some((s) => s.row === row && s.column === column);
    let nextLocked: Array<{ row: number; column: number }>;

    if (exists) {
      nextLocked = currentLocked.filter((s) => !(s.row === row && s.column === column));
      message.info(`已解锁 第 ${row} 排 ${column} 座`);
    } else {
      nextLocked = [...currentLocked, { row, column }];
      message.success(`已锁定 第 ${row} 排 ${column} 座（自动排座不移动）`);
    }

    commitDraft({
      ...draft,
      environment: {
        ...draft.environment,
        lockedSeats: nextLocked.length > 0 ? nextLocked : undefined,
      },
    });
    setSeatActionMenuKey(null);
  }

  function handleDeleteSeat(row: number, column: number) {
    if (!isEditing || !draft) return;
    if (assignmentByPosition.has(`${row}-${column}`)) {
      message.warning("只有空座才可以删除，请先将学生移出座位");
      return;
    }
    const currentDisabled = draft.environment.disabledSeats ?? [];
    if (currentDisabled.some((s) => s.row === row && s.column === column)) return;

    const nextDisabled = [...currentDisabled, { row, column }];
    const nextAssignments = draft.assignments.filter(
      (a) => !(a.row === row && a.column === column),
    );

    const currentLocked = draft.environment.lockedSeats ?? [];
    const nextLocked = currentLocked.filter((s) => !(s.row === row && s.column === column));

    commitDraft({
      ...draft,
      assignments: nextAssignments,
      environment: {
        ...draft.environment,
        disabledSeats: nextDisabled,
        lockedSeats: nextLocked.length > 0 ? nextLocked : undefined,
      },
    });
    setSeatActionMenuKey(null);
    message.success(`已从画布中删除 第 ${row} 排 ${column} 座`);
  }

  function handleRestoreSeat(row: number, column: number) {
    if (!isEditing || !draft) return;
    const currentDisabled = draft.environment.disabledSeats ?? [];
    const nextDisabled = currentDisabled.filter((s) => !(s.row === row && s.column === column));

    commitDraft({
      ...draft,
      environment: {
        ...draft.environment,
        disabledSeats: nextDisabled.length > 0 ? nextDisabled : undefined,
      },
    });
    message.success(`已恢复 第 ${row} 排 ${column} 座`);
  }

  function applyQuickScheme(scheme: SeatingRotationScheme) {
    if (!draft) return;
    const result = rotateSeatAssignments(
      draft.assignments,
      draft.rows,
      draft.columns,
      scheme,
      lockedSeatKeys,
      disabledSeatKeys,
    );
    commitDraft({
      ...draft,
      assignments: result.newAssignments,
    });
    message.success(
      `已应用「${scheme.name}」：轮换 ${result.movedCount} 名学生${
        result.lockedCount > 0 ? `，保持锁定 ${result.lockedCount} 席` : ""
      }`,
    );
  }

  function handleApplySchemeModal(newAssignments: Assignment[]) {
    if (!draft) return;
    commitDraft({
      ...draft,
      assignments: newAssignments,
    });
  }

  function seatActionMenuItems(row: number, column: number): NonNullable<MenuProps["items"]> {
    const isLocked = lockedSeatKeys.has(seatKey(row, column));
    return [
      {
        key: "replace-student",
        icon: <SwapOutlined style={{ color: "var(--primary)" }} />,
        label: "更换学生...",
      },
      {
        key: "toggle-lock",
        icon: <LockOutlined style={isLocked ? { color: "var(--gold-accent)" } : undefined} />,
        label: isLocked ? "解锁座位（允许自动排座）" : "锁定此座（自动排座不移动）",
      },
      { type: "divider" },
      {
        key: "remove-seat",
        danger: true,
        icon: <CloseOutlined />,
        label: "移出座位（变为空座）",
      },
    ];
  }

  function emptySeatActionMenuItems(row: number, column: number): NonNullable<MenuProps["items"]> {
    const isLocked = lockedSeatKeys.has(seatKey(row, column));
    return [
      {
        key: "assign-student",
        icon: <UserAddOutlined style={{ color: "var(--primary)" }} />,
        label: "安排学生...",
      },
      {
        key: "toggle-lock",
        icon: <LockOutlined style={isLocked ? { color: "var(--gold-accent)" } : undefined} />,
        label: isLocked ? "解锁此空座" : "锁定此空座（保留空位）",
      },
      { type: "divider" },
      {
        key: "delete-seat",
        danger: true,
        icon: <DeleteOutlined />,
        label: "删除此座（从画布移除）",
      },
    ];
  }

  function handleSeatActionMenu(row: number, column: number, key: string, currentStudent: Student | null) {
    if (key === "replace-student" || key === "assign-student") {
      setReplaceModalTarget({ row, column, currentStudent });
      setReplaceSearchQuery("");
      setReplaceGenderFilter("ALL");
      setSeatActionMenuKey(null);
      return;
    }
    if (key === "toggle-lock") {
      toggleSeatLock(row, column);
      setSeatActionMenuKey(null);
      return;
    }
    if (key === "remove-seat") {
      clearSeat(row, column);
      return;
    }
    if (key === "delete-seat") {
      handleDeleteSeat(row, column);
      return;
    }
    if (currentStudent) {
      changeSeat(row, column, key);
    }
    setSeatActionMenuKey(null);
  }

  function handleExecuteReplace(targetStudentId: string) {
    if (!replaceModalTarget || !draft) return;
    const { row, column, currentStudent } = replaceModalTarget;
    const targetStudent = studentById.get(targetStudentId);
    if (!targetStudent) return;

    const existingAssignment = assignmentByStudent.get(targetStudentId);

    if (currentStudent) {
      const nextAssignments = draft.assignments.filter(
        (a) => a.studentId !== currentStudent.id && a.studentId !== targetStudentId,
      );

      if (existingAssignment) {
        nextAssignments.push({
          studentId: currentStudent.id,
          row: existingAssignment.row,
          column: existingAssignment.column,
        });
        nextAssignments.push({
          studentId: targetStudentId,
          row,
          column,
        });
        message.success(`已互换座次：${targetStudent.name} ↔ ${currentStudent.name}`);
      } else {
        nextAssignments.push({
          studentId: targetStudentId,
          row,
          column,
        });
        message.success(`已将 第 ${row} 排 ${column} 座更换为 ${targetStudent.name}`);
      }

      commitDraft({
        ...draft,
        assignments: nextAssignments,
      });
    } else {
      // 当前为空座：安排学生入座
      const nextAssignments = draft.assignments.filter(
        (a) => a.studentId !== targetStudentId && !(a.row === row && a.column === column),
      );
      nextAssignments.push({
        studentId: targetStudentId,
        row,
        column,
      });
      if (existingAssignment) {
        message.success(`已将 ${targetStudent.name} 从第 ${existingAssignment.row} 排 ${existingAssignment.column} 座调至 第 ${row} 排 ${column} 座`);
      } else {
        message.success(`已安排 ${targetStudent.name} 入座 第 ${row} 排 ${column} 座`);
      }
      commitDraft({
        ...draft,
        assignments: nextAssignments,
      });
    }

    setReplaceModalTarget(null);
    setReplaceSearchQuery("");
    setReplaceGenderFilter("ALL");
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
    nextEnvironment.aisleAfterColumns = nextEnvironment.aisleAfterColumns.filter(
      (column) => column < nextColumns,
    );

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
        title: "确认应用新的座位规格与过道？",
        content: details,
        okText: "继续调整",
        cancelText: "取消",
        onOk: apply,
      });
      return;
    }
    apply();
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
      <div className="room-side-column" aria-label="教室门窗标记">
        <div className="room-side-track">
          {orderedRows.map((row) => {
            const feature = sideFeatureForRow(draft.environment[side], row);
            const markerClass = `room-side-marker ${feature ? `room-side-marker-${feature.toLowerCase()}` : ""}`;
            const hasFeature = feature !== null;
            const markerContent = (
              <>
                {(isEditing || hasFeature) && (
                  <span className="room-side-marker-icon">{featureIcon(feature)}</span>
                )}
                {hasFeature ? (
                  <span className="room-side-marker-text">{featureLabels[feature]}</span>
                ) : (
                  <span className="room-side-marker-row-label">第 {row} 排</span>
                )}
              </>
            );

            if (!isEditing) {
              return (
                <div
                  key={`${side}-${row}`}
                  className={`${markerClass} room-side-marker-static`}
                  data-side={side}
                  data-marker-row={row}
                  aria-label={`第 ${row} 排，${feature ? featureLabels[feature] : "未设置"}`}
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
                aria-label={`第 ${row} 排，${feature ? featureLabels[feature] : "未设置"}。点击切换标记`}
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

  function renderFrontRail() {
    return (
      <div className="room-front room-front-bottom">
        <span aria-hidden="true" />
        <div className="blackboard">
          <strong>讲台</strong>
          <small>BLACKBOARD</small>
        </div>
        <span aria-hidden="true" />
      </div>
    );
  }

  return (
    <>
      <LedgerSheet
        kicker="SEATING PLAN"
        title={pageTitle}
        onTitleClick={handleTitleClick}
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
              {isEditing && (
                <>
                  <Tooltip title={editor.past.length ? `上一步 (撤销 ⌘Z · 剩余 ${editor.past.length} 步)` : "上一步 (撤销 ⌘Z)"}>
                    <Button
                      type="text"
                      aria-label="上一步 (撤销)"
                      icon={<UndoOutlined />}
                      disabled={!editor.past.length}
                      onClick={() => { dispatch({ type: "undo" }); setSelectedStudentId(null); }}
                    />
                  </Tooltip>
                  <Tooltip title={editor.future.length ? `下一步 (重做 ⇧⌘Z · 剩余 ${editor.future.length} 步)` : "下一步 (重做 ⇧⌘Z)"}>
                    <Button
                      type="text"
                      aria-label="下一步 (重做)"
                      icon={<RedoOutlined />}
                      disabled={!editor.future.length}
                      onClick={() => { dispatch({ type: "redo" }); setSelectedStudentId(null); }}
                    />
                  </Tooltip>
                </>
              )}
            </Space>
            {!isEditing ? (
              <Button type="primary" icon={<EditOutlined />} onClick={enterEditing}>
                编辑座次
              </Button>
            ) : (
              <>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: "quick-default",
                        icon: <SyncOutlined style={{ color: "var(--primary)" }} />,
                        label: "边列进中 · 集体后移一排（默认）",
                        onClick: () => applyQuickScheme(DEFAULT_ROTATION_SCHEME),
                      },
                      {
                        key: "quick-cycle",
                        icon: <ApartmentOutlined />,
                        label: "大组向右循环 · 集体后移一排",
                        onClick: () => applyQuickScheme(PRESET_ROTATION_SCHEMES[1]),
                      },
                      {
                        key: "quick-mirror",
                        icon: <SwapOutlined />,
                        label: "左右大组对调 · 排数不动",
                        onClick: () => applyQuickScheme(PRESET_ROTATION_SCHEMES[2]),
                      },
                      {
                        key: "quick-forward",
                        icon: <RollbackOutlined style={{ transform: "rotate(90deg)" }} />,
                        label: "全班集体前移一排",
                        onClick: () => applyQuickScheme(PRESET_ROTATION_SCHEMES[3]),
                      },
                      {
                        key: "quick-mirror-both",
                        icon: <SwapOutlined />,
                        label: "整班180度翻转（讲台与左右均对调）",
                        onClick: () => applyQuickScheme(PRESET_ROTATION_SCHEMES[5]),
                      },
                      { type: "divider" },
                      {
                        key: "open-custom-modal",
                        icon: <SettingOutlined />,
                        label: "自定义轮换方案...",
                        onClick: () => setSchemeModalOpen(true),
                      },
                    ],
                  }}
                  trigger={["click"]}
                >
                  <Button icon={<SyncOutlined />} disabled={saving}>
                    自动排座
                  </Button>
                </Dropdown>
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
          {
            label: "SEATS // 已安排",
            value: draft ? assignedCount : "—",
            unit: "席",
            detail: draft
              ? (unassignedStudentCount > 0
                ? `共 ${studentCount} 名学生 · 待安排 ${unassignedStudentCount} 人`
                : `共 ${studentCount} 名学生 · 全部已排座`)
              : "正在读取座次",
            icon: <TeamOutlined />,
          },
          {
            label: "CAPACITY // 座位容量",
            value: draft ? (draft.rows * draft.columns - disabledSeatKeys.size) : "—",
            unit: "席",
            detail: draft
              ? disabledSeatKeys.size > 0
                ? `${draft.rows}×${draft.columns} 网格 · 已移除 ${disabledSeatKeys.size} 空座`
                : `${draft.rows} 排 × ${draft.columns} 列`
              : "等待布局",
            icon: <ColumnWidthOutlined />,
          },
          {
            label: "AISLE // 教室过道",
            value: draft ? aisleAfterColumns.length : "—",
            unit: "条",
            detail: draft ? `座位划分为 ${aisleAfterColumns.length + 1} 个大组` : "等待教室配置",
            icon: <SettingOutlined />,
          },
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
            <section
              className="seating-canvas-section seating-print-region"
              aria-label="教室座位画布"
              style={{ "--room-center-min-width": `${seatGridMinimumWidth}px` } as CSSProperties}
            >
              <div className="seating-print-header" aria-hidden="true">
                <strong>{pageTitle}</strong>
              </div>

              <div className="seating-map-scroll">
                <div className="seating-map">
                  <div className="room-layout">
                    {renderSideRail("right")}
                    <div className="room-center-column">
                      <div className="seat-grid" style={{ gridTemplateColumns: seatGridTemplate }}>
                        {orderedRows.map((row) => {
                          return (
                            <Fragment key={`row-${row}`}>
                              {orderedColumns.map((column) => {
                                const assignment = assignmentByPosition.get(`${row}-${column}`);
                                const student = assignment ? studentById.get(assignment.studentId) : undefined;
                                const positionKey = `${row}-${column}`;
                                const isDisabled = disabledSeatKeys.has(positionKey);
                                const isTarget = dropTarget === positionKey;
                                return (
                                  <Fragment key={positionKey}>
                                    {isDisabled ? (
                                      isEditing ? (
                                        <div
                                          className="seat-cell seat-cell-disabled"
                                          data-seat-row={row}
                                          data-seat-column={column}
                                        >
                                          <button
                                            type="button"
                                            className="seat-cell-restore-btn"
                                            onClick={() => handleRestoreSeat(row, column)}
                                            title="点击恢复此座位到画布"
                                            aria-label={`恢复第 ${row} 排 ${column} 座`}
                                          >
                                            <PlusOutlined />
                                            <span>恢复此座</span>
                                          </button>
                                        </div>
                                      ) : (
                                        <div
                                          className="seat-cell seat-cell-removed"
                                          data-seat-row={row}
                                          data-seat-column={column}
                                          aria-hidden="true"
                                        />
                                      )
                                    ) : (
                                      <div
                                        className={`seat-cell ${student ? "seat-cell-filled" : "seat-cell-empty"} ${isEditing ? "seat-cell-editable" : "seat-cell-readonly"} ${isTarget ? "seat-cell-drop-target" : ""} ${lockedSeatKeys.has(positionKey) ? "seat-cell-locked" : ""}`}
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
                                                  items: seatActionMenuItems(row, column),
                                                  onClick: ({ key }) => handleSeatActionMenu(row, column, String(key), student),
                                                }}
                                                classNames={{ root: "seat-replacement-menu" }}
                                              >
                                                <button
                                                  type="button"
                                                  className={`seat-student ${studentToneClass(student)} ${selectedStudentId === student.id ? "seat-student-selected" : ""} ${lockedSeatKeys.has(positionKey) ? "seat-student-locked" : ""}`}
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
                                                  {lockedSeatKeys.has(positionKey) && (
                                                    <span className="seat-lock-badge" title="已锁定座位（自动排座不移动）">
                                                      <LockOutlined />
                                                    </span>
                                                  )}
                                                  <span className="seat-student-copy"><strong className="seat-student-name" title={student.name}>{student.name}</strong></span>
                                                </button>
                                              </Dropdown>
                                            ) : (
                                              <div className={`seat-student seat-student-readonly ${studentToneClass(student)} ${lockedSeatKeys.has(positionKey) ? "seat-student-locked" : ""}`} aria-label={`${row}排${column}座，${student.name}`}>
                                                {lockedSeatKeys.has(positionKey) && (
                                                  <span className="seat-lock-badge" title="已锁定座位（自动排座不移动）">
                                                    <LockOutlined />
                                                  </span>
                                                )}
                                                <span className="seat-student-copy"><strong className="seat-student-name" title={student.name}>{student.name}</strong></span>
                                              </div>
                                            )}
                                          </div>
                                        ) : (
                                          isEditing ? (
                                            <Dropdown
                                              trigger={["contextMenu"]}
                                              open={seatActionMenuKey === positionKey}
                                              onOpenChange={(open) => setSeatActionMenuKey(open ? positionKey : null)}
                                              menu={{
                                                items: emptySeatActionMenuItems(row, column),
                                                onClick: ({ key }) => handleSeatActionMenu(row, column, String(key), null),
                                              }}
                                              classNames={{ root: "seat-replacement-menu" }}
                                            >
                                              <div className="seat-empty-editor">
                                                <button
                                                  type="button"
                                                  className="seat-cell-delete-btn"
                                                  title="从画布中删除此空座"
                                                  aria-label={`删除第 ${row} 排 ${column} 空座`}
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteSeat(row, column);
                                                  }}
                                                >
                                                  <CloseOutlined />
                                                </button>
                                                {lockedSeatKeys.has(positionKey) && (
                                                  <span className="seat-lock-badge" title="已锁定空座（保留空位）">
                                                    <LockOutlined />
                                                  </span>
                                                )}
                                                <div className="seat-empty-trigger">
                                                  <UserAddOutlined />
                                                  <span>安排学生</span>
                                                </div>
                                              </div>
                                            </Dropdown>
                                          ) : (
                                            <div className="seat-empty-editor">
                                              {lockedSeatKeys.has(positionKey) && (
                                                <span className="seat-lock-badge" title="已锁定空座（保留空位）">
                                                  <LockOutlined />
                                                </span>
                                              )}
                                              <div className="seat-empty-trigger">
                                                <DragOutlined />
                                                <span>空座</span>
                                              </div>
                                            </div>
                                          )
                                        )}
                                      </div>
                                    )}
                                    {(mirrorColumns
                                      ? aisleAfterColumns.includes(column - 1)
                                      : isSeatingAisleAfterColumn(column, draft.columns, aisleAfterColumns)) && (
                                      <div className="seat-aisle" aria-hidden="true">
                                        {row === orderedRows[0] && <span>过道</span>}
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
                    {renderSideRail("left")}
                  </div>
                  {renderFrontRail()}
                </div>
              </div>
            </section>
          </div>

          {isEditing && <div className="seating-workspace-footer">
            <Space size={6}><SwapOutlined /><span>拖动已安排学生到其他座位可直接交换；点击空座或右键可安排/更换学生。</span></Space>
            <span className="seating-footer-capacity">座位容量 {draft.rows * draft.columns - disabledSeatKeys.size} · 当前安排 {assignedCount}</span>
          </div>}
        </div>
      )}
      </LedgerSheet>
      <Modal
        className="seating-settings-modal"
        title="座位布局与过道设置"
        open={layoutSettingsModalOpen}
        width={580}
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
                  <h3>座位规格</h3>
                  <p>调整座位排数与列数（最大 12 排 × 12 列）。</p>
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
            </section>

            <section className="seating-settings-section">
              <div className="seating-settings-section-heading">
                <div>
                  <h3>过道插入位置</h3>
                  <p>过道插入在指定座位列之后，形成学生通行的走道。</p>
                </div>
                <Tag>{pendingDimensions.environment.aisleAfterColumns.filter((column) => column < pendingDimensions.columns).length} 条过道</Tag>
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
            </section>

            <div className="seating-settings-capacity">
              <span>座位容量</span>
              <strong>{pendingDimensions.rows * pendingDimensions.columns} 个</strong>
              <small>当前绘制 {pendingDimensions.environment.aisleAfterColumns.filter((column) => column < pendingDimensions.columns).length} 条过道</small>
            </div>
          </div>
        )}
      </Modal>
      {draft && (
        <SeatingSchemeModal
          open={schemeModalOpen}
          onCancel={() => setSchemeModalOpen(false)}
          onApply={handleApplySchemeModal}
          currentAssignments={draft.assignments}
          rows={draft.rows}
          columns={draft.columns}
          students={data?.students ?? []}
          lockedSeatKeys={lockedSeatKeys}
          disabledSeatKeys={disabledSeatKeys}
        />
      )}
      {replaceModalTarget && (
        <Modal
          className="replace-student-modal"
          title={
            <Space>
              <SwapOutlined style={{ color: "var(--primary)" }} />
              <span>{replaceModalTarget.currentStudent ? "更换座位学生" : "安排座位学生"}</span>
            </Space>
          }
          open={Boolean(replaceModalTarget)}
          onCancel={() => {
            setReplaceModalTarget(null);
            setReplaceSearchQuery("");
            setReplaceGenderFilter("ALL");
          }}
          footer={null}
          width={500}
          destroyOnHidden
        >
          <div className="replace-seat-info-bar">
            <span>
              目标座位：<strong>第 {replaceModalTarget.row} 排 {replaceModalTarget.column} 座</strong>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span>当前学生：</span>
              {replaceModalTarget.currentStudent ? (
                <>
                  <strong>{replaceModalTarget.currentStudent.name}</strong>
                  {(() => {
                    const g = resolveStudentGender(
                      replaceModalTarget.currentStudent.gender,
                      replaceModalTarget.currentStudent.name,
                    );
                    return (
                      <span className={`student-gender-badge student-gender-badge-${g.value.toLowerCase()}`}>
                        {g.label}
                      </span>
                    );
                  })()}
                </>
              ) : (
                <Tag color="default">空座</Tag>
              )}
            </span>
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <Input
              prefix={<SearchOutlined />}
              placeholder="输入姓名、学号或“男”/“女”快速搜索..."
              allowClear
              autoFocus
              value={replaceSearchQuery}
              onChange={(e) => setReplaceSearchQuery(e.target.value)}
              style={{ flex: 1 }}
            />
            <Segmented
              value={replaceGenderFilter}
              onChange={(val) => setReplaceGenderFilter(val as "ALL" | "MALE" | "FEMALE")}
              options={[
                { label: "全部", value: "ALL" },
                { label: "男", value: "MALE" },
                { label: "女", value: "FEMALE" },
              ]}
            />
          </div>
          <div className="replace-student-list">
            {(data?.students ?? [])
              .filter((s) => !replaceModalTarget.currentStudent || s.id !== replaceModalTarget.currentStudent.id)
              .filter((s) => {
                const g = resolveStudentGender(s.gender, s.name);
                if (replaceGenderFilter !== "ALL" && g.value !== replaceGenderFilter) {
                  return false;
                }
                if (!replaceSearchQuery.trim()) return true;
                const q = replaceSearchQuery.trim().toLowerCase();
                const matchGender = (q === "男" && g.value === "MALE") || (q === "女" && g.value === "FEMALE");
                return s.name.toLowerCase().includes(q) || s.studentNo.toLowerCase().includes(q) || matchGender;
              })
              .map((s) => {
                const assignedPos = assignmentByStudent.get(s.id);
                const g = resolveStudentGender(s.gender, s.name);
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="replace-student-item"
                    onClick={() => handleExecuteReplace(s.id)}
                  >
                    <div className="replace-student-meta">
                      <span className="replace-student-name">{s.name}</span>
                      <span className={`student-gender-badge student-gender-badge-${g.value.toLowerCase()}`}>
                        {g.label}
                      </span>
                      <span className="replace-student-no">{s.studentNo}</span>
                    </div>
                    {assignedPos ? (
                      <Tag color="blue">
                        在 {assignedPos.row}排{assignedPos.column}座 · {replaceModalTarget.currentStudent ? "互换" : "调座"}
                      </Tag>
                    ) : (
                      <Tag color="green">未安排 · 入座</Tag>
                    )}
                  </button>
                );
              })}
            {(data?.students ?? [])
              .filter((s) => !replaceModalTarget.currentStudent || s.id !== replaceModalTarget.currentStudent.id)
              .filter((s) => {
                const g = resolveStudentGender(s.gender, s.name);
                if (replaceGenderFilter !== "ALL" && g.value !== replaceGenderFilter) {
                  return false;
                }
                if (!replaceSearchQuery.trim()) return true;
                const q = replaceSearchQuery.trim().toLowerCase();
                const matchGender = (q === "男" && g.value === "MALE") || (q === "女" && g.value === "FEMALE");
                return s.name.toLowerCase().includes(q) || s.studentNo.toLowerCase().includes(q) || matchGender;
              }).length === 0 && (
              <div className="replace-student-empty">未搜索到匹配的学生</div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
