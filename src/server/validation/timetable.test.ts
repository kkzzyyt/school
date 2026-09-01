import { describe, expect, it } from "vitest";
import { ZodError } from "zod";

import {
  timetableEntrySchema,
  timetablePeriodInputSchema,
  timetablePeriodPatchSchema,
  timetableSaveSchema,
} from "./timetable";

describe("timetablePeriodInputSchema", () => {
  it.each([
    ["MORNING_STUDY", "早自习", "07:20", "07:50"],
    ["LUNCH_BREAK", "午休", "12:00", "13:30"],
    ["EVENING_STUDY", "晚自习一", "19:00", "20:30"],
  ])("accepts the %s named period and its explicit time range", (type, name, startTime, endTime) => {
    expect(
      timetablePeriodInputSchema.parse({ name, type, startTime, endTime }),
    ).toMatchObject({ name, type, startTime, endTime });
  });

  it.each([
    ["invalid hour", "24:00", "24:30"],
    ["invalid minute", "08:60", "09:00"],
    ["equal endpoints", "08:00", "08:00"],
    ["end before start", "09:00", "08:59"],
  ])("rejects %s", (_caseName, startTime, endTime) => {
    expect(() => timetablePeriodInputSchema.parse({
      name: "第1节",
      type: "CLASS",
      startTime,
      endTime,
    })).toThrow(ZodError);
  });
});

describe("timetablePeriodPatchSchema", () => {
  it("allows a single field patch", () => {
    expect(timetablePeriodPatchSchema.parse({ name: "早读" })).toEqual({ name: "早读" });
  });

  it("still rejects an explicitly reversed patch range", () => {
    expect(() => timetablePeriodPatchSchema.parse({
      startTime: "10:00",
      endTime: "09:00",
    })).toThrow(ZodError);
  });
});

describe("timetableEntrySchema", () => {
  it("accepts a legacy numeric period or a maintained period id", () => {
    expect(timetableEntrySchema.parse({
      courseId: "course-1",
      weekday: 1,
      period: 9,
      teacherId: "teacher-1",
    })).toMatchObject({ period: 9, teacherId: "teacher-1" });

    expect(timetableEntrySchema.parse({
      courseId: "course-1",
      weekday: 1,
      periodId: "period-early",
    })).toMatchObject({ periodId: "period-early" });
  });

  it("requires at least one period reference", () => {
    expect(() => timetableEntrySchema.parse({
      courseId: "course-1",
      weekday: 1,
    })).toThrow(ZodError);
  });

  it("rejects invalid weekdays and out-of-range period numbers", () => {
    expect(() => timetableSaveSchema.parse({
      entries: [{ courseId: "course-1", weekday: 0, period: 1 }],
    })).toThrow(ZodError);
    expect(() => timetableSaveSchema.parse({
      entries: [{ courseId: "course-1", weekday: 1, period: 1001 }],
    })).toThrow(ZodError);
  });
});
