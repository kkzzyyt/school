export type TimetableSlotKind = "regular" | "early" | "lunch" | "evening";

export interface ScheduleSlot {
  period: number;
  slotId: string;
  label: string;
  time: string;
  kind: TimetableSlotKind;
  bookable: boolean;
}

export const SCHEDULE_SLOTS: readonly ScheduleSlot[] = [
  { period: 9, slotId: "early-study", label: "早自习", time: "07:20 - 07:50", kind: "early", bookable: true },
  { period: 1, slotId: "period-1", label: "第1节", time: "08:00 - 08:45", kind: "regular", bookable: true },
  { period: 2, slotId: "period-2", label: "第2节", time: "08:55 - 09:40", kind: "regular", bookable: true },
  { period: 3, slotId: "period-3", label: "第3节", time: "10:00 - 10:45", kind: "regular", bookable: true },
  { period: 4, slotId: "period-4", label: "第4节", time: "10:55 - 11:40", kind: "regular", bookable: true },
  { period: 10, slotId: "lunch-break", label: "午休", time: "12:00 - 13:30", kind: "lunch", bookable: false },
  { period: 5, slotId: "period-5", label: "第5节", time: "14:00 - 14:45", kind: "regular", bookable: true },
  { period: 6, slotId: "period-6", label: "第6节", time: "14:55 - 15:40", kind: "regular", bookable: true },
  { period: 7, slotId: "period-7", label: "第7节", time: "16:00 - 16:45", kind: "regular", bookable: true },
  { period: 8, slotId: "period-8", label: "第8节", time: "16:55 - 17:40", kind: "regular", bookable: true },
  { period: 11, slotId: "evening-study-1", label: "晚自习一", time: "19:00 - 20:30", kind: "evening", bookable: true },
  { period: 12, slotId: "evening-study-2", label: "晚自习二", time: "20:40 - 21:30", kind: "evening", bookable: true },
] as const;

export interface WeekdayOption {
  value: number;
  label: string;
  shortLabel: string;
}

export const WEEKDAYS: readonly WeekdayOption[] = [
  { value: 1, label: "周一", shortLabel: "一" },
  { value: 2, label: "周二", shortLabel: "二" },
  { value: 3, label: "周三", shortLabel: "三" },
  { value: 4, label: "周四", shortLabel: "四" },
  { value: 5, label: "周五", shortLabel: "五" },
] as const;

export interface TimetableCourse {
  id: string;
  name: string;
  color: string;
}

export interface TimetableApiTeacher {
  id?: string;
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: "ACTIVE" | "INACTIVE" | "active" | "inactive" | string;
}

export interface TimetableApiSlot {
  period: number;
  slotId?: string;
  label?: string;
  time?: string;
  kind?: TimetableSlotKind;
  bookable?: boolean;
}

export interface TimetableApiEntry {
  id?: string;
  courseId: string;
  weekday: number;
  period: number;
  teacherName?: string | null;
  teacherId?: string | null;
  room?: string | null;
  slotId?: string | null;
  course?: TimetableCourse;
}

export interface TimetableApiResponse {
  courses: TimetableCourse[];
  entries: TimetableApiEntry[];
  teachers?: TimetableApiTeacher[];
  slots?: TimetableApiSlot[];
  periods?: Array<{ id: string; period: number; name: string; type: string; startTime: string; endTime: string; sortOrder: number }>;
}

export interface TimetableEntry {
  id?: string;
  courseId: string;
  weekday: number;
  period: number;
  teacherName: string | null;
  teacherId?: string | null;
  room: string | null;
  slotId?: string | null;
  course: TimetableCourse;
}

export interface TimetableData {
  courses: TimetableCourse[];
  entries: TimetableEntry[];
  teachers: TimetableApiTeacher[];
  slots: ScheduleSlot[];
}

export interface TimetablePosition {
  weekday: number;
  period: number;
}

export interface TimetableSaveEntry {
  courseId: string;
  weekday: number;
  period: number;
  teacherName: string | null;
  room: string | null;
  teacherId?: string | null;
  slotId?: string | null;
  periodId?: string | null;
}

export interface TimetableSavePayload {
  entries: TimetableSaveEntry[];
}

export function resolveScheduleSlots(apiSlots?: readonly TimetableApiSlot[]): ScheduleSlot[] {
  if (apiSlots && apiSlots.length > 0) {
    const serverSlots = apiSlots.map((apiSlot) => {
      const defaultSlot = SCHEDULE_SLOTS.find((slot) => slot.period === apiSlot.period) ?? SCHEDULE_SLOTS[0];
      return {
        ...defaultSlot,
        slotId: apiSlot.slotId ?? defaultSlot.slotId,
        label: apiSlot.label ?? defaultSlot.label,
        time: apiSlot.time ?? defaultSlot.time,
        kind: apiSlot.kind ?? defaultSlot.kind,
        bookable: apiSlot.bookable ?? defaultSlot.bookable,
      };
    });
    const serverPeriods = new Set(apiSlots.map((slot) => slot.period));
    return [
      ...serverSlots,
      ...SCHEDULE_SLOTS.filter((slot) => !serverPeriods.has(slot.period)).map((slot) => ({ ...slot })),
    ];
  }

  return SCHEDULE_SLOTS.map((defaultSlot) => {
    const apiSlot = apiSlots?.find((slot) => slot.period === defaultSlot.period);
    if (!apiSlot) return { ...defaultSlot };

    return {
      ...defaultSlot,
      slotId: apiSlot.slotId ?? defaultSlot.slotId,
      label: apiSlot.label ?? defaultSlot.label,
      time: apiSlot.time ?? defaultSlot.time,
      kind: apiSlot.kind ?? defaultSlot.kind,
      bookable: apiSlot.bookable ?? defaultSlot.bookable,
    };
  });
}

export function normalizeTimetableData(response: TimetableApiResponse): TimetableData {
  const courses = response.courses ?? [];
  const entries = (response.entries ?? []).map((entry) => ({
    ...entry,
    teacherName: entry.teacherName ?? null,
    room: entry.room ?? null,
    course: entry.course ?? courses.find((course) => course.id === entry.courseId) ?? {
      id: entry.courseId,
      name: "未知课程",
      color: "#7c8798",
    },
  }));

  return {
    courses,
    entries,
    teachers: response.teachers ?? [],
    slots: resolveScheduleSlots(response.slots),
  };
}

export function toLegacyTimetablePayload(entries: readonly TimetableEntry[]): TimetableSavePayload {
  return {
    entries: entries.map((entry) => ({
      courseId: entry.courseId,
      weekday: entry.weekday,
      period: entry.period,
      teacherName: entry.teacherName,
      room: entry.room,
    })),
  };
}

export function toTimetableWritePayload(
  entries: readonly TimetableEntry[],
  options: { includeExtendedFields?: boolean } = {},
): TimetableSavePayload {
  const payload = toLegacyTimetablePayload(entries);
  if (!options.includeExtendedFields) return payload;

  return {
    entries: payload.entries.map((entry, index) => {
      const source = entries[index];
      return {
        ...entry,
        ...(source.teacherId ? { teacherId: source.teacherId } : {}),
        ...(source.slotId ? { periodId: source.slotId } : {}),
      };
    }),
  };
}

export function positionKey(position: TimetablePosition): string {
  return `${position.weekday}:${position.period}`;
}

export function getSlot(slots: readonly ScheduleSlot[], period: number): ScheduleSlot | undefined {
  return slots.find((slot) => slot.period === period);
}
