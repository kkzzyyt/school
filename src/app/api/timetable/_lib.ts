interface TimetablePeriodForSlotView {
  id: string;
  period: number;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
}

export function toSlotView(periods: readonly TimetablePeriodForSlotView[]) {
  return periods.map((period) => ({
    period: period.period,
    slotId: period.id,
    label: period.name,
    time: `${period.startTime} - ${period.endTime}`,
    kind:
      period.type === "MORNING_STUDY"
        ? "early"
        : period.type === "LUNCH_BREAK"
          ? "lunch"
          : period.type === "EVENING_STUDY"
            ? "evening"
            : "regular",
    bookable: period.type !== "LUNCH_BREAK",
  }));
}
