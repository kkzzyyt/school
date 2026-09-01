import { describe, expect, it } from "vitest";

import {
  SCHEDULE_SLOTS,
  normalizeTimetableData,
  positionKey,
  resolveScheduleSlots,
} from "./timetable.types";

describe("schedule slots", () => {
  it("contains explicit times for early study, lunch, and evening study", () => {
    expect(SCHEDULE_SLOTS).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "早自习", time: "07:20 - 07:50", kind: "early", bookable: true }),
      expect.objectContaining({ label: "午休", time: "12:00 - 13:30", kind: "lunch", bookable: false }),
      expect.objectContaining({ label: "晚自习一", time: "19:00 - 20:30", kind: "evening", bookable: true }),
    ]));
  });

  it("merges server slot labels/times without dropping default special slots", () => {
    const slots = resolveScheduleSlots([
      { period: 9, slotId: "morning", label: "早自习（调整）", time: "07:10 - 07:45", kind: "early", bookable: true },
    ]);

    expect(slots.find((slot) => slot.period === 9)).toMatchObject({
      slotId: "morning",
      label: "早自习（调整）",
      time: "07:10 - 07:45",
    });
    expect(slots.find((slot) => slot.period === 10)).toMatchObject({
      label: "午休",
      bookable: false,
    });
  });
});

describe("normalizeTimetableData", () => {
  it("joins entries to courses and keeps maintained teachers", () => {
    const result = normalizeTimetableData({
      courses: [{ id: "course-1", name: "语文", color: "#4f6f52" }],
      teachers: [{ id: "teacher-1", name: "王老师", status: "ACTIVE" }],
      entries: [{
        courseId: "course-1",
        weekday: 1,
        period: 9,
        teacherId: "teacher-1",
        teacherName: null,
        room: null,
      }],
    });

    expect(result.teachers).toEqual([{ id: "teacher-1", name: "王老师", status: "ACTIVE" }]);
    expect(result.entries[0]).toMatchObject({
      teacherId: "teacher-1",
      teacherName: null,
      course: { id: "course-1", name: "语文" },
    });
  });

  it("provides a visible fallback course when an API entry is incomplete", () => {
    const result = normalizeTimetableData({
      courses: [],
      entries: [{ courseId: "missing-course", weekday: 1, period: 1 }],
    });

    expect(result.entries[0].course).toEqual({
      id: "missing-course",
      name: "未知课程",
      color: "#7c8798",
    });
  });
});

describe("positionKey", () => {
  it("provides a stable drag-and-drop position key", () => {
    expect(positionKey({ weekday: 2, period: 10 })).toBe("2:10");
  });
});
