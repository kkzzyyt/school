import type { TimetableApiTeacher, TimetableEntry, TimetableCourse } from "@/components/timetable/timetable.types";
import type { TeacherRecord, TeacherStatus } from "@/components/teachers/teacher.types";

const STORAGE_KEY = "school.teacher-directory.v1";

interface StoredTeacher extends TeacherRecord {
  courseIds?: string[];
  weekdays?: number[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStoredTeacher(value: unknown): StoredTeacher | null {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.id !== "string") return null;
  return {
    id: value.id,
    name: value.name,
    title: typeof value.title === "string" ? value.title : "任课教师",
    phone: typeof value.phone === "string" ? value.phone : null,
    email: typeof value.email === "string" ? value.email : null,
    status: value.status === "inactive" || value.status === "INACTIVE" ? "inactive" : "active",
    courseIds: Array.isArray(value.courseIds) ? value.courseIds.filter((id): id is string => typeof id === "string") : [],
    weekdays: Array.isArray(value.weekdays) ? value.weekdays.filter((day): day is number => typeof day === "number") : [],
  };
}

export function readStoredTeachers(): TeacherRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? parsed.map(normalizeStoredTeacher).filter((teacher): teacher is StoredTeacher => Boolean(teacher))
      : [];
  } catch {
    return [];
  }
}

export function persistTeachers(teachers: readonly TeacherRecord[]): void {
  if (typeof window === "undefined") return;
  const payload = teachers.map((teacher) => ({
    ...teacher,
    courseIds: undefined,
    weekdays: undefined,
  }));
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

function makeLocalTeacherId(name: string): string {
  return `local-${encodeURIComponent(name.trim())}`;
}

function normalizeStatus(status: unknown): TeacherStatus {
  return status === "inactive" || status === "INACTIVE" ? "inactive" : "active";
}

export function mergeTeacherDirectory(
  entries: readonly TimetableEntry[],
  storedTeachers: readonly TeacherRecord[],
  apiTeachers: readonly TimetableApiTeacher[] = [],
): TeacherRecord[] {
  const byName = new Map<string, TeacherRecord>();

  for (const teacher of storedTeachers) {
    byName.set(teacher.name, { ...teacher });
  }
  for (const teacher of apiTeachers) {
    const existing = byName.get(teacher.name);
    byName.set(teacher.name, {
      id: teacher.id ?? existing?.id ?? makeLocalTeacherId(teacher.name),
      name: teacher.name,
      title: teacher.title ?? existing?.title ?? "任课教师",
      phone: teacher.phone ?? existing?.phone ?? null,
      email: teacher.email ?? existing?.email ?? null,
      status: normalizeStatus(teacher.status ?? existing?.status),
    });
  }

  for (const entry of entries) {
    const name = entry.teacherName?.trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, {
      id: makeLocalTeacherId(name),
      name,
      title: "任课教师",
      phone: null,
      email: null,
      status: "active",
    });
  }

  return [...byName.values()].sort((left, right) => {
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

export function getTeacherCourses(
  teacher: TeacherRecord,
  entries: readonly TimetableEntry[],
): TimetableCourse[] {
  const seen = new Set<string>();
  return entries
    .filter((entry) => entry.teacherName?.trim() === teacher.name)
    .filter((entry) => {
      if (seen.has(entry.courseId)) return false;
      seen.add(entry.courseId);
      return true;
    })
    .map((entry) => entry.course);
}

export function getTeacherWeekdays(teacher: TeacherRecord, entries: readonly TimetableEntry[]): number[] {
  return [...new Set(
    entries
      .filter((entry) => entry.teacherName?.trim() === teacher.name)
      .map((entry) => entry.weekday),
  )].sort((left, right) => left - right);
}

export function getTeacherInitial(name: string): string {
  return name.trim().slice(0, 1) || "师";
}
