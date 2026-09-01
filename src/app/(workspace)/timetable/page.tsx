"use client";

import {
  CalendarOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  DragOutlined,
  ExclamationCircleOutlined,
  SaveOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  AutoComplete,
  Button,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Skeleton,
  Tag,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeading } from "@/components/layout/PageHeading";
import { TimetableBoard, type TimetableViewMode } from "@/components/timetable/TimetableBoard";
import {
  getSlot,
  normalizeTimetableData,
  positionKey,
  SCHEDULE_SLOTS,
  toTimetableWritePayload,
  WEEKDAYS,
  type ScheduleSlot,
  type TimetableApiResponse,
  type TimetableData,
  type TimetableEntry,
  type TimetablePosition,
} from "@/components/timetable/timetable.types";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

import styles from "@/components/timetable/timetable.module.css";

interface CellFormValues {
  courseId: string;
  teacherName?: string;
  room?: string;
  moveTo?: string;
}

interface TimetableDraft {
  sourceSignature: string;
  entries: TimetableEntry[];
  dirty: boolean;
}

function getTimetableSignature(data: TimetableApiResponse | null): string {
  if (!data) return "";
  return JSON.stringify({ courses: data.courses, entries: data.entries, slots: data.slots, teachers: data.teachers });
}

function getInitialWeekday(): number {
  const weekday = new Date().getDay();
  return weekday >= 1 && weekday <= 5 ? weekday : 1;
}

function parsePosition(value: string): TimetablePosition | null {
  const [weekday, period] = value.split(":").map(Number);
  if (!Number.isInteger(weekday) || !Number.isInteger(period)) return null;
  return { weekday, period };
}

function isSamePosition(left: TimetablePosition, right: TimetablePosition): boolean {
  return left.weekday === right.weekday && left.period === right.period;
}

export default function TimetablePage() {
  const { message } = App.useApp();
  const router = useRouter();
  const { data, loading, error, refresh } = useApiData<TimetableApiResponse>("/api/timetable");
  const timetable = useMemo<TimetableData | null>(() => data ? normalizeTimetableData(data) : null, [data]);
  const sourceSignature = useMemo(() => getTimetableSignature(data), [data]);
  const [draft, setDraft] = useState<TimetableDraft | null>(null);
  const [activeWeekday, setActiveWeekday] = useState(getInitialWeekday);
  const [viewMode, setViewMode] = useState<TimetableViewMode>("week");
  const [editingPosition, setEditingPosition] = useState<TimetablePosition | null>(null);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [form] = Form.useForm<CellFormValues>();

  const activeDraft = draft?.sourceSignature === sourceSignature ? draft : null;
  const entries = activeDraft?.entries ?? timetable?.entries ?? [];
  const slots = timetable?.slots ?? [...SCHEDULE_SLOTS];
  const isDirty = activeDraft?.dirty ?? false;

  function updateEntries(nextEntries: TimetableEntry[]) {
    if (!sourceSignature) return;
    setDraft({ sourceSignature, entries: nextEntries, dirty: true });
  }

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 640px)");
    const syncViewMode = () => setViewMode(mediaQuery.matches ? "day" : "week");
    mediaQuery.addEventListener("change", syncViewMode);
    if (mediaQuery.matches) window.requestAnimationFrame(syncViewMode);
    return () => mediaQuery.removeEventListener("change", syncViewMode);
  }, []);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeave);
    return () => window.removeEventListener("beforeunload", warnBeforeLeave);
  }, [isDirty]);

  const editingEntry = editingPosition
    ? entries.find((entry) => positionKey(entry) === positionKey(editingPosition))
    : undefined;
  const editingSlot = editingPosition ? getSlot(slots, editingPosition.period) : undefined;
  const activeDay = WEEKDAYS.find((weekday) => weekday.value === activeWeekday) ?? WEEKDAYS[0];

  const teacherNames = useMemo(() => {
    return [...new Set(entries.map((entry) => entry.teacherName).filter((name): name is string => Boolean(name?.trim())))]
      .sort((left, right) => left.localeCompare(right, "zh-CN"));
  }, [entries]);

  const moveOptions = useMemo(() => {
    if (!editingPosition) return [];
    return slots
      .filter((slot) => slot.bookable)
      .map((slot) => WEEKDAYS.map((weekday) => ({
        value: `${weekday.value}:${slot.period}`,
        label: `${weekday.label} · ${slot.label} · ${slot.time}`,
        disabled: isSamePosition(editingPosition, { weekday: weekday.value, period: slot.period }),
      })))
      .flat();
  }, [editingPosition, slots]);

  const assignedCount = entries.length;
  const totalBookableSlots = slots.filter((slot) => slot.bookable).length * WEEKDAYS.length;
  const emptyCount = Math.max(totalBookableSlots - assignedCount, 0);
  const specialCount = slots.filter((slot) => slot.kind !== "regular").length;

  function openCell(position: TimetablePosition) {
    const slot = getSlot(slots, position.period);
    const entry = entries.find((item) => positionKey(item) === positionKey(position));
    if (!slot?.bookable && !entry) {
      message.info("午休是固定休息时间，暂不安排课程");
      return;
    }

    form.resetFields();
    if (entry) {
      form.setFieldsValue({
        courseId: entry.courseId,
        teacherName: entry.teacherName ?? undefined,
        room: entry.room ?? undefined,
      });
    }
    setEditingPosition(position);
  }

  function closeCell() {
    setEditingPosition(null);
    form.resetFields();
  }

  async function applyCell() {
    if (!editingPosition || !timetable) return;
    setApplying(true);
    try {
      const values = await form.validateFields();
      const targetPosition = values.moveTo ? parsePosition(values.moveTo) : editingPosition;
      if (!targetPosition) {
        message.error("移动目标无效，请重新选择");
        return;
      }

      const targetSlot = getSlot(slots, targetPosition.period);
      if (!targetSlot?.bookable) {
        message.warning("午休是固定休息时间，不能安排课程");
        return;
      }

      const targetEntry = entries.find((entry) => positionKey(entry) === positionKey(targetPosition));
      if (targetEntry && !isSamePosition(editingPosition, targetPosition)) {
        message.warning("目标时间已有课程，请先清空或拖动现有课程");
        return;
      }

      const course = timetable.courses.find((item) => item.id === values.courseId);
      if (!course) {
        message.error("课程不存在，请刷新后重试");
        return;
      }

      const sourceEntry = entries.find((entry) => positionKey(entry) === positionKey(editingPosition));
      const teacherName = values.teacherName?.trim() || null;
      const room = values.room?.trim() || null;
      const nextEntry: TimetableEntry = {
        ...(sourceEntry ?? {}),
        courseId: values.courseId,
        weekday: targetPosition.weekday,
        period: targetPosition.period,
        teacherName,
        teacherId: sourceEntry?.teacherName === teacherName ? sourceEntry.teacherId : null,
        room,
        slotId: targetSlot.slotId,
        course,
      };

      updateEntries([
        ...entries.filter((entry) => {
          const key = positionKey(entry);
          return key !== positionKey(editingPosition) && key !== positionKey(targetPosition);
        }),
        nextEntry,
      ]);
      closeCell();
      message.success("安排已更新，记得保存课表");
    } catch {
      // Ant Design keeps the validation message next to the invalid field.
    } finally {
      setApplying(false);
    }
  }

  function clearCell() {
    if (!editingPosition) return;
    updateEntries(entries.filter((entry) => positionKey(entry) !== positionKey(editingPosition)));
    closeCell();
    message.success("该时间段已清空，记得保存课表");
  }

  function moveEntry(source: TimetablePosition, target: TimetablePosition) {
    if (isSamePosition(source, target)) return;
    const targetSlot = getSlot(slots, target.period);
    const sourceEntry = entries.find((entry) => positionKey(entry) === positionKey(source));
    if (!sourceEntry) return;
    if (!targetSlot?.bookable) {
      message.warning("午休是固定休息时间，不能移动课程到这里");
      return;
    }

    const targetEntry = entries.find((entry) => positionKey(entry) === positionKey(target));
    updateEntries(entries.map((entry) => {
      const entryPosition = positionKey(entry);
      if (entryPosition === positionKey(source)) {
        return { ...entry, weekday: target.weekday, period: target.period, slotId: targetSlot.slotId };
      }
      if (targetEntry && entryPosition === positionKey(target)) {
        return { ...entry, weekday: source.weekday, period: source.period, slotId: getSlot(slots, source.period)?.slotId };
      }
      return entry;
    }));
    message.success(targetEntry ? "课程已交换，记得保存课表" : "课程已移动，记得保存课表");
  }

  async function saveTimetable() {
    if (!timetable) return;
    setSaving(true);
    try {
      await apiRequest<{ count: number }>("/api/timetable", {
        method: "PUT",
        body: JSON.stringify(toTimetableWritePayload(entries, { includeExtendedFields: data?.slots !== undefined })),
      });
      await refresh();
      setDraft(null);
      setLastSavedAt(new Date());
      message.success("课程表已保存");
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const savedLabel = lastSavedAt
    ? `上次保存 ${lastSavedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`
    : "尚未在本次编辑中保存";

  return (
    <div className={styles.page}>
      <PageHeading
        kicker="WEEKLY TIMETABLE"
        title="班级课程安排"
        description="按天快速查看，按周集中调整；每个时间段都带有明确的上课时间。"
        action={(
          <div className={styles.headingActions}>
            <Button icon={<TeamOutlined />} onClick={() => router.push("/teachers")}>任课老师</Button>
            <Button
              className={styles.saveButton}
              type="primary"
              icon={<SaveOutlined />}
              loading={saving}
              disabled={!isDirty || loading}
              onClick={() => void saveTimetable()}
            >
              保存课表
            </Button>
          </div>
        )}
      />

      {error && (
        <Alert
          type="error"
          showIcon
          title={error.message}
          action={<Button type="link" onClick={() => void refresh()}>重新加载</Button>}
        />
      )}

      <section className={styles.statusStrip} aria-label="课表状态">
        <div className={styles.statusLead}>
          <span className={`${styles.statusIcon} ${isDirty ? styles.statusIconDirty : ""}`} aria-hidden="true">
            {isDirty ? <ExclamationCircleOutlined /> : <CheckCircleOutlined />}
          </span>
          <div className={styles.statusText}>
            <span className={styles.statusTitle}>{isDirty ? "有未保存修改" : "课表已同步"}</span>
            <span className={styles.statusDescription}>{isDirty ? "拖动或编辑后的变更等待保存" : savedLabel}</span>
          </div>
          <Tag color={isDirty ? "gold" : "green"}>{isDirty ? "待保存" : "已保存"}</Tag>
        </div>
        <div className={styles.statusMeta}>
          <div className={styles.summaryMetrics} aria-label="课表统计">
            <span className={styles.metric}><strong className={styles.metricValue}>{assignedCount}</strong> 已排</span>
            <span className={styles.metricDivider} aria-hidden="true" />
            <span className={styles.metric}><strong className={styles.metricValue}>{emptyCount}</strong> 空余</span>
            <span className={styles.metricDivider} aria-hidden="true" />
            <span className={styles.metric}><strong className={styles.metricValue}>{specialCount}</strong> 特殊时段</span>
          </div>
          <div className={styles.legend} aria-label="时间段图例">
            <span className={styles.legendItem}><i className={`${styles.legendDot} ${styles.legendRegular}`} />正常课程</span>
            <span className={styles.legendItem}><i className={`${styles.legendDot} ${styles.legendSpecial}`} />早晚自习</span>
            <span className={styles.legendItem}><i className={`${styles.legendDot} ${styles.legendRest}`} />午休</span>
          </div>
        </div>
      </section>

      <section className={styles.viewPanel} aria-label="课表视图切换">
        <div className={styles.controlsRow}>
          <div className={styles.viewControlGroup}>
            <span className={styles.viewLabel}>查看方式</span>
            <Segmented
              aria-label="查看方式"
              value={viewMode}
              options={[
                { value: "day", label: "日视图", icon: <CalendarOutlined /> },
                { value: "week", label: "周视图", icon: <TeamOutlined /> },
              ]}
              onChange={(value) => setViewMode(value as TimetableViewMode)}
            />
          </div>
          <span className={styles.viewLabel}>{viewMode === "day" ? "单日排课" : "一周总览"}</span>
        </div>

        <div className={styles.dayPicker} role="tablist" aria-label="选择工作日">
          {WEEKDAYS.map((weekday) => {
            const isActive = weekday.value === activeWeekday;
            const isToday = weekday.value === getInitialWeekday();
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className={`${styles.dayButton} ${isActive ? styles.dayButtonActive : ""}`}
                key={weekday.value}
                onClick={() => setActiveWeekday(weekday.value)}
              >
                <span className={styles.dayNumber}>{weekday.shortLabel}</span>
                <span className={styles.dayText}>
                  <span>{weekday.label}</span>
                  {isToday && <span className={styles.dayToday}>今天</span>}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={styles.boardSection} aria-label="课程表">
        <div className={styles.boardMeta}>
          <div>
            <h2 className={styles.boardTitle}>{viewMode === "day" ? `${activeDay?.label ?? "今日"}课程` : "本周课程总览"}</h2>
            <p className={styles.boardSubtitle}>早自习 · 上午课程 · 午休 · 下午课程 · 晚自习</p>
          </div>
          <div className={styles.boardHint}><DragOutlined aria-hidden="true" />拖动课程卡片可移动，点击卡片可编辑</div>
        </div>
        {loading || !timetable ? (
          <div className={styles.loading}><Skeleton active paragraph={{ rows: 12 }} /></div>
        ) : (
          <TimetableBoard
            mode={viewMode}
            activeWeekday={activeWeekday}
            weekdays={WEEKDAYS}
            slots={slots}
            entries={entries}
            onOpenCell={openCell}
            onMoveEntry={moveEntry}
          />
        )}
      </section>

      <Modal
        title={editingPosition && editingSlot
          ? `${WEEKDAYS.find((weekday) => weekday.value === editingPosition.weekday)?.label ?? "工作日"} · ${editingSlot.label} · ${editingSlot.time}`
          : "编辑课程"}
        open={Boolean(editingPosition)}
        onCancel={closeCell}
        onOk={() => void applyCell()}
        okText="保存安排"
        confirmLoading={applying}
        footer={(_, { OkBtn, CancelBtn }) => (
          <div className="timetable-modal-footer">
            {editingEntry ? (
              <Button danger icon={<CloseOutlined />} onClick={clearCell}>清空节次</Button>
            ) : <span />}
            <div className={styles.modalActions}><CancelBtn /><OkBtn /></div>
          </div>
        )}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="courseId" label="课程" rules={[{ required: true, message: "请选择课程" }]}>
            <Select
              showSearch
              placeholder="选择课程"
              optionFilterProp="label"
              options={(timetable?.courses ?? []).map((course) => ({ value: course.id, label: course.name }))}
            />
          </Form.Item>
          <Form.Item name="teacherName" label="任课教师">
            <AutoComplete
              options={teacherNames.map((name) => ({ value: name }))}
              filterOption={(input, option) => String(option?.value ?? "").includes(input)}
            >
              <Input placeholder="输入或选择教师姓名" />
            </AutoComplete>
          </Form.Item>
          <Form.Item name="room" label="教室"><Input placeholder="例如：A-203" /></Form.Item>
          {editingEntry && (
            <Form.Item name="moveTo" label="移动到">
              <Select allowClear placeholder="保持当前时间段" options={moveOptions} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </div>
  );
}
