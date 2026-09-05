"use client";

import {
  CoffeeOutlined,
  DragOutlined,
  EditOutlined,
  HomeOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Tooltip } from "antd";
import { Fragment, useState } from "react";

import type {
  ScheduleSlot,
  TimetableEntry,
  TimetablePosition,
  TimetableSlotKind,
  WeekdayOption,
} from "@/components/timetable/timetable.types";
import { positionKey } from "@/components/timetable/timetable.types";

import styles from "./timetable.module.css";

export type TimetableViewMode = "day" | "week";

interface TimetableBoardProps {
  mode: TimetableViewMode;
  activeWeekday: number;
  weekdays: readonly WeekdayOption[];
  slots: readonly ScheduleSlot[];
  entries: readonly TimetableEntry[];
  onOpenCell: (position: TimetablePosition) => void;
  onMoveEntry: (source: TimetablePosition, target: TimetablePosition) => void;
}

interface DropCellProps {
  weekday: number;
  weekdayLabel: string;
  slot: ScheduleSlot;
  entry?: TimetableEntry;
  onOpenCell: (position: TimetablePosition) => void;
  onMoveEntry: (source: TimetablePosition, target: TimetablePosition) => void;
}

function getKindClass(kind: TimetableSlotKind): string {
  return {
    regular: styles.slotKindRegular,
    early: styles.slotKindEarly,
    lunch: styles.slotKindLunch,
    evening: styles.slotKindEvening,
  }[kind];
}

function getCellLabel(weekdayLabel: string, slot: ScheduleSlot, entry?: TimetableEntry): string {
  const periodLabel = slot.kind === "regular"
    ? `第 ${slot.period} 节`
    : `${slot.label}（时间段 ${slot.period}）`;
  const details = entry
    ? `${entry.course.name}，${entry.teacherName ?? "教师待定"}，${entry.room ?? "教室待定"}`
    : "未安排课程";
  return `${weekdayLabel}${periodLabel}，${details}`;
}

function getDragPosition(event: React.DragEvent<HTMLElement>): TimetablePosition | null {
  const rawPosition = event.dataTransfer.getData("text/plain");
  const [weekday, period] = rawPosition.split(":").map(Number);
  if (!Number.isInteger(weekday) || !Number.isInteger(period)) return null;
  return { weekday, period };
}

function CourseCard({
  weekday,
  weekdayLabel,
  slot,
  entry,
  onOpenCell,
  onDragStart,
  onDragEnd,
}: {
  weekday: number;
  weekdayLabel: string;
  slot: ScheduleSlot;
  entry: TimetableEntry;
  onOpenCell: (position: TimetablePosition) => void;
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, position: TimetablePosition) => void;
  onDragEnd: () => void;
}) {
  const position = { weekday, period: slot.period };
  const label = getCellLabel(weekdayLabel, slot, entry);

  return (
    <button
      type="button"
      className={styles.courseCard}
      style={{ "--course-color": entry.course?.color || "#015186" } as React.CSSProperties}
      draggable
      aria-label={label}
      onClick={() => onOpenCell(position)}
      onDragStart={(event) => onDragStart(event, position)}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpenCell(position);
        }
      }}
    >
      <span className={styles.courseCardHeader}>
        <span className={styles.courseColor} aria-hidden="true" />
        <strong className={styles.courseName}>{entry.course.name}</strong>
        <Tooltip title="拖动到其他时间段">
          <DragOutlined className={styles.dragIcon} aria-hidden="true" />
        </Tooltip>
      </span>
      <span className={styles.courseMeta}>{entry.teacherName ?? "教师待定"}</span>
      <span className={styles.courseMeta}>
        <HomeOutlined aria-hidden="true" />
        {entry.room ?? "教室待定"}
      </span>
      <span className={styles.courseEditHint}><EditOutlined aria-hidden="true" /> 编辑安排</span>
    </button>
  );
}

function DropCell({
  weekday,
  weekdayLabel,
  slot,
  entry,
  onOpenCell,
  onMoveEntry,
}: DropCellProps) {
  const [dragging, setDragging] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const position = { weekday, period: slot.period };
  const cellLabel = getCellLabel(weekdayLabel, slot, entry);
  const canReceiveDrop = slot.bookable;
  const className = [
    styles.dropCell,
    getKindClass(slot.kind),
    dragOver ? styles.dropCellOver : "",
    dragging ? styles.dropCellDragging : "",
    !slot.bookable && !entry ? styles.dropCellDisabled : "",
  ].filter(Boolean).join(" ");

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!canReceiveDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    if (!canReceiveDrop) return;
    const source = getDragPosition(event);
    if (!source || positionKey(source) === positionKey(position)) return;
    onMoveEntry(source, position);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false);
  }

  return (
    <div
      className={className}
      role="gridcell"
      data-position={positionKey(position)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {entry ? (
        <CourseCard
          weekday={weekday}
          weekdayLabel={weekdayLabel}
          slot={slot}
          entry={entry}
          onOpenCell={onOpenCell}
          onDragStart={(event, source) => {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", positionKey(source));
            setDragging(true);
          }}
          onDragEnd={() => setDragging(false)}
        />
      ) : slot.bookable ? (
        <button
          type="button"
          className={styles.emptyCell}
          aria-label={cellLabel}
          onClick={() => onOpenCell(position)}
        >
          <PlusOutlined aria-hidden="true" />
          <span>安排课程</span>
        </button>
      ) : (
        <div className={styles.restCell} aria-label={cellLabel}>
          <CoffeeOutlined aria-hidden="true" />
          <span>休息时间</span>
        </div>
      )}
    </div>
  );
}

function SlotLabel({ slot }: { slot: ScheduleSlot }) {
  return (
    <div className={`${styles.slotLabel} ${getKindClass(slot.kind)}`}>
      <span className={styles.slotLabelTitle}>{slot.label}</span>
      <span className={styles.slotLabelTime}>{slot.time}</span>
      {slot.kind !== "regular" && <span className={styles.slotLabelKind}>{slot.kind === "lunch" ? "休息" : "特殊时段"}</span>}
    </div>
  );
}

function DayBoard({
  weekday,
  weekdayLabel,
  slots,
  entries,
  onOpenCell,
  onMoveEntry,
}: {
  weekday: number;
  weekdayLabel: string;
  slots: readonly ScheduleSlot[];
  entries: readonly TimetableEntry[];
  onOpenCell: (position: TimetablePosition) => void;
  onMoveEntry: (source: TimetablePosition, target: TimetablePosition) => void;
}) {
  const entryMap = new Map(
    entries.filter((entry) => entry.weekday === weekday).map((entry) => [entry.period, entry]),
  );

  return (
    <div className={styles.dayBoard} role="grid" aria-label={`${weekdayLabel}课程安排`}>
      {slots.map((slot) => (
        <div className={styles.dayRow} key={slot.slotId}>
          <SlotLabel slot={slot} />
          <DropCell
            weekday={weekday}
            weekdayLabel={weekdayLabel}
            slot={slot}
            entry={entryMap.get(slot.period)}
            onOpenCell={onOpenCell}
            onMoveEntry={onMoveEntry}
          />
        </div>
      ))}
    </div>
  );
}

function WeekBoard({
  weekdays,
  slots,
  entries,
  onOpenCell,
  onMoveEntry,
}: {
  weekdays: readonly WeekdayOption[];
  slots: readonly ScheduleSlot[];
  entries: readonly TimetableEntry[];
  onOpenCell: (position: TimetablePosition) => void;
  onMoveEntry: (source: TimetablePosition, target: TimetablePosition) => void;
}) {
  const entryMap = new Map(entries.map((entry) => [positionKey(entry), entry]));

  return (
    <div className={styles.weekScroll}>
      <div className={styles.weekGrid} role="grid" aria-label="本周课程安排">
        <div className={`${styles.weekHeader} ${styles.weekCorner}`} role="columnheader">
          <span>时间</span>
          <small>拖动调整</small>
        </div>
        {weekdays.map((weekday) => (
          <div className={styles.weekHeader} role="columnheader" key={weekday.value}>
            <strong>{weekday.label}</strong>
            <small>{weekday.value === 1 ? "Weekday" : `0${weekday.value}`}</small>
          </div>
        ))}
        {slots.map((slot) => (
          <Fragment key={slot.slotId}>
            <div className={`${styles.weekSlotLabel} ${getKindClass(slot.kind)}`} role="rowheader">
              <strong>{slot.label}</strong>
              <span>{slot.time}</span>
            </div>
            {weekdays.map((weekday) => (
              <DropCell
                key={`${weekday.value}-${slot.slotId}`}
                weekday={weekday.value}
                weekdayLabel={weekday.label}
                slot={slot}
                entry={entryMap.get(positionKey({ weekday: weekday.value, period: slot.period }))}
                onOpenCell={onOpenCell}
                onMoveEntry={onMoveEntry}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </div>
  );
}

export function TimetableBoard({
  mode,
  activeWeekday,
  weekdays,
  slots,
  entries,
  onOpenCell,
  onMoveEntry,
}: TimetableBoardProps) {
  const activeDay = weekdays.find((weekday) => weekday.value === activeWeekday) ?? weekdays[0];

  if (mode === "day" && activeDay) {
    return (
      <DayBoard
        weekday={activeDay.value}
        weekdayLabel={activeDay.label}
        slots={slots}
        entries={entries}
        onOpenCell={onOpenCell}
        onMoveEntry={onMoveEntry}
      />
    );
  }

  return (
    <WeekBoard
      weekdays={weekdays}
      slots={slots}
      entries={entries}
      onOpenCell={onOpenCell}
      onMoveEntry={onMoveEntry}
    />
  );
}
