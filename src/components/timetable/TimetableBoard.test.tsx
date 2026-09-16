import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimetableBoard } from "./TimetableBoard";
import { SCHEDULE_SLOTS, WEEKDAYS, type TimetableEntry } from "./timetable.types";

describe("TimetableBoard", () => {
  const dummyEntries: TimetableEntry[] = [
    {
      courseId: "course-math",
      weekday: 1,
      period: 1,
      teacherName: "王老师",
      room: "A-101",
      slotId: "slot-1",
      course: { id: "course-math", name: "数学", color: "#3f75c8" },
    },
  ];

  it("renders mobile scroll hint when in week mode", () => {
    render(
      <TimetableBoard
        mode="week"
        activeWeekday={1}
        weekdays={WEEKDAYS}
        slots={SCHEDULE_SLOTS}
        entries={dummyEntries}
        onOpenCell={vi.fn()}
        onMoveEntry={vi.fn()}
      />
    );

    expect(screen.getByText(/左右滑动查看周一至周五完整课表/)).toBeInTheDocument();
  });

  it("renders day view without week scroll hint when in day mode", () => {
    render(
      <TimetableBoard
        mode="day"
        activeWeekday={1}
        weekdays={WEEKDAYS}
        slots={SCHEDULE_SLOTS}
        entries={dummyEntries}
        onOpenCell={vi.fn()}
        onMoveEntry={vi.fn()}
      />
    );

    expect(screen.queryByText(/左右滑动查看周一至周五完整课表/)).not.toBeInTheDocument();
    expect(screen.getByText("数学")).toBeInTheDocument();
  });
});
