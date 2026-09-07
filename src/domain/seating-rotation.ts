import type { SeatAssignment } from "./seating";

export type RotationRowDirection = "BACKWARD" | "FORWARD" | "NONE" | "MIRROR";
export type RotationColumnMode =
  | "OUTER_TO_INNER" // 边列进中，中列出边 (默认)
  | "GROUP_CYCLE_RIGHT" // 大组向右循环
  | "GROUP_CYCLE_LEFT" // 大组向左循环
  | "COLUMN_MIRROR" // 左右镜像翻转
  | "CUSTOM_MAP"; // 自定义列映射

export interface SeatingRotationScheme {
  id: string;
  name: string;
  description: string;
  isPreset?: boolean;
  rowShift: {
    direction: RotationRowDirection;
    step: number; // 默认 1
  };
  columnShift: {
    mode: RotationColumnMode;
    groupWidth: number; // 默认 2
    customMap?: Record<number, number>; // 自定义 1-based column 映射
  };
  options: {
    respectLocks: boolean;
  };
}

export const PRESET_ROTATION_SCHEMES: readonly SeatingRotationScheme[] = [
  {
    id: "outer-to-inner-backward-1",
    name: "边列进中 · 集体后移一排",
    description: "经典双周轮换：边上两列移至中间，中间两列移至边侧，前后排整体后移一排，最后排循环至首排。",
    isPreset: true,
    rowShift: {
      direction: "BACKWARD",
      step: 1,
    },
    columnShift: {
      mode: "OUTER_TO_INNER",
      groupWidth: 2,
    },
    options: {
      respectLocks: true,
    },
  },
  {
    id: "cycle-right-backward-1",
    name: "大组向右循环 · 集体后移一排",
    description: "大组整体依次向右平移一组，最右侧大组循环回最左侧，前后排集体后移一排。",
    isPreset: true,
    rowShift: {
      direction: "BACKWARD",
      step: 1,
    },
    columnShift: {
      mode: "GROUP_CYCLE_RIGHT",
      groupWidth: 2,
    },
    options: {
      respectLocks: true,
    },
  },
  {
    id: "mirror-columns",
    name: "左右大组对调 · 排数不动",
    description: "左右大组对称对调，保持前后排数不变，适用于快速平衡左右视力与光线。",
    isPreset: true,
    rowShift: {
      direction: "NONE",
      step: 0,
    },
    columnShift: {
      mode: "COLUMN_MIRROR",
      groupWidth: 2,
    },
    options: {
      respectLocks: true,
    },
  },
  {
    id: "forward-1",
    name: "全班集体前移一排 · 列数不动",
    description: "所有排数向前推移一排，第一排循环回最后一排，左右列保持不变。",
    isPreset: true,
    rowShift: {
      direction: "FORWARD",
      step: 1,
    },
    columnShift: {
      mode: "OUTER_TO_INNER",
      groupWidth: 2,
    },
    options: {
      respectLocks: true,
    },
  },
];

export const DEFAULT_ROTATION_SCHEME = PRESET_ROTATION_SCHEMES[0];

/**
 * 计算单行的行号变换
 */
export function calculateRowShift(
  row: number,
  totalRows: number,
  direction: RotationRowDirection,
  step = 1,
): number {
  if (totalRows <= 1 || direction === "NONE") return row;
  const safeStep = Math.max(1, Math.min(step, totalRows - 1));

  if (direction === "BACKWARD") {
    // 1-based, 后移: 1 -> 2, 2 -> 3, totalRows -> 1
    return ((row - 1 + safeStep) % totalRows) + 1;
  }
  if (direction === "FORWARD") {
    // 1-based, 前移: 2 -> 1, 1 -> totalRows
    return (((row - 1 - safeStep) % totalRows) + totalRows) % totalRows + 1;
  }
  if (direction === "MIRROR") {
    // 前后对调
    return totalRows - row + 1;
  }
  return row;
}

/**
 * 划分大组并计算单列的列号变换
 */
export function calculateColumnShift(
  column: number,
  totalColumns: number,
  mode: RotationColumnMode,
  groupWidth = 2,
  customMap?: Record<number, number>,
): number {
  if (totalColumns <= 1) return column;

  if (mode === "CUSTOM_MAP" && customMap && customMap[column]) {
    const target = customMap[column];
    if (target >= 1 && target <= totalColumns) return target;
  }

  if (mode === "COLUMN_MIRROR") {
    return totalColumns - column + 1;
  }

  // 计算大组划分
  const safeGroupWidth = Math.max(1, Math.min(groupWidth, Math.floor(totalColumns / 2) || 1));
  const groupCount = Math.floor(totalColumns / safeGroupWidth);

  // 如果无法划分为至少2个大组，则退化为直接对调
  if (groupCount < 2) {
    return totalColumns - column + 1;
  }

  // 属于哪个大组 (0-indexed) 以及在大组内的偏移
  const groupIndex = Math.floor((column - 1) / safeGroupWidth);
  const offsetInGroup = (column - 1) % safeGroupWidth;

  // 超出完整大组范围的余数列 (例如 8 列划分为 3*2+2，正好整除；若 9 列，最后一列为留空列)
  if (groupIndex >= groupCount) {
    return column;
  }

  let targetGroupIndex = groupIndex;

  if (mode === "OUTER_TO_INNER") {
    // 边列进中，中列出边
    // 针对典型 4 个大组 [0, 1, 2, 3]:
    // 0 (最左) 与 1 (中偏左) 对调
    // 3 (最右) 与 2 (中偏右) 对调
    if (groupCount === 4) {
      if (groupIndex === 0) targetGroupIndex = 1;
      else if (groupIndex === 1) targetGroupIndex = 0;
      else if (groupIndex === 2) targetGroupIndex = 3;
      else if (groupIndex === 3) targetGroupIndex = 2;
    } else if (groupCount >= 2) {
      // 通用算法：两端的大组向内推进，内侧的大组向两端推移
      const half = Math.floor(groupCount / 2);
      if (groupIndex < half) {
        // 前半部分：左侧
        targetGroupIndex = (groupIndex + 1) % half;
      } else {
        // 后半部分：右侧
        const rightOffset = groupIndex - half;
        targetGroupIndex = half + ((rightOffset + 1) % (groupCount - half));
      }
    }
  } else if (mode === "GROUP_CYCLE_RIGHT") {
    // 大组向右循环
    targetGroupIndex = (groupIndex + 1) % groupCount;
  } else if (mode === "GROUP_CYCLE_LEFT") {
    // 大组向左循环
    targetGroupIndex = (groupIndex - 1 + groupCount) % groupCount;
  }

  return targetGroupIndex * safeGroupWidth + offsetInGroup + 1;
}

/**
 * 位置字符串转换辅助
 */
export function seatKey(row: number, column: number): string {
  return `${row}-${column}`;
}

export function parseSeatKey(key: string): { row: number; column: number } | null {
  const parts = key.split("-").map(Number);
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return { row: parts[0], column: parts[1] };
  }
  return null;
}

/**
 * 完整排座/轮换演算函数
 */
export function rotateSeatAssignments(
  assignments: readonly SeatAssignment[],
  rows: number,
  columns: number,
  scheme: SeatingRotationScheme,
  lockedSeatKeys: ReadonlySet<string> = new Set(),
  disabledSeatKeys: ReadonlySet<string> = new Set(),
): {
  newAssignments: SeatAssignment[];
  movedCount: number;
  lockedCount: number;
} {
  if (rows <= 0 || columns <= 0 || assignments.length === 0) {
    return { newAssignments: [...assignments], movedCount: 0, lockedCount: 0 };
  }

  // 1. 构建每个座位的理想移动目标
  const idealMap = new Map<string, string>();
  for (let r = 1; r <= rows; r++) {
    const targetRow = calculateRowShift(r, rows, scheme.rowShift.direction, scheme.rowShift.step);
    for (let c = 1; c <= columns; c++) {
      const targetColumn = calculateColumnShift(
        c,
        columns,
        scheme.columnShift.mode,
        scheme.columnShift.groupWidth,
        scheme.columnShift.customMap,
      );
      idealMap.set(seatKey(r, c), seatKey(targetRow, targetColumn));
    }
  }

  // 2. 处理锁定与已删除空座约束
  const effectiveLockedKeys = scheme.options.respectLocks ? lockedSeatKeys : new Set<string>();
  const cannotOccupy = (key: string) => effectiveLockedKeys.has(key) || disabledSeatKeys.has(key);
  const finalPositionMap = new Map<string, string>();

  for (let r = 1; r <= rows; r++) {
    for (let c = 1; c <= columns; c++) {
      const originKey = seatKey(r, c);
      if (disabledSeatKeys.has(originKey)) {
        // 已从画布删除的座位不参与分配
        finalPositionMap.set(originKey, originKey);
      } else if (effectiveLockedKeys.has(originKey)) {
        // 锁定座位保持不动
        finalPositionMap.set(originKey, originKey);
      } else {
        // 沿置换环追踪直到找到未被锁定且未被删除的目标位置
        let candidate = idealMap.get(originKey) ?? originKey;
        const visited = new Set<string>([originKey]);
        while (cannotOccupy(candidate) && !visited.has(candidate)) {
          visited.add(candidate);
          candidate = idealMap.get(candidate) ?? candidate;
        }
        finalPositionMap.set(originKey, candidate);
      }
    }
  }

  // 3. 应用于当前已安排的学生
  const newAssignments: SeatAssignment[] = [];
  let movedCount = 0;
  let lockedCount = 0;

  for (const assignment of assignments) {
    const originKey = seatKey(assignment.row, assignment.column);
    const isLocked = effectiveLockedKeys.has(originKey);
    const targetKey = finalPositionMap.get(originKey) ?? originKey;
    const targetCoord = parseSeatKey(targetKey) ?? { row: assignment.row, column: assignment.column };

    if (isLocked) {
      lockedCount++;
    } else if (targetKey !== originKey) {
      movedCount++;
    }

    newAssignments.push({
      studentId: assignment.studentId,
      row: targetCoord.row,
      column: targetCoord.column,
    });
  }

  // 保持按 row, column 排序
  newAssignments.sort((a, b) => a.row - b.row || a.column - b.column);

  return {
    newAssignments,
    movedCount,
    lockedCount,
  };
}
