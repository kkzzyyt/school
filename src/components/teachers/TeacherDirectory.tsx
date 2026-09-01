"use client";

import {
  ArrowLeftOutlined,
  BookOutlined,
  CalendarOutlined,
  DeleteOutlined,
  EditOutlined,
  MailOutlined,
  PhoneOutlined,
  PlusOutlined,
  SaveOutlined,
  SearchOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
} from "@ant-design/icons";
import {
  Alert,
  App,
  Avatar,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Skeleton,
  Switch,
  Tag,
  Tooltip,
} from "antd";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { PageHeading } from "@/components/layout/PageHeading";
import {
  normalizeTimetableData,
  toTimetableWritePayload,
  WEEKDAYS,
  type TimetableApiResponse,
  type TimetableData,
  type TimetableEntry,
} from "@/components/timetable/timetable.types";
import { useApiData } from "@/hooks/useApiData";
import { apiRequest } from "@/lib/api";

import { TEACHER_DIRECTORY_ENDPOINT, toTeacherDirectoryWritePayload } from "./teacher-api";
import {
  getTeacherCourses,
  getTeacherInitial,
  getTeacherWeekdays,
  mergeTeacherDirectory,
  persistTeachers,
  readStoredTeachers,
} from "./teacher-data";
import type { TeacherFormValues, TeacherRecord, TeacherStatus } from "./teacher.types";
import styles from "./teachers.module.css";

type TeacherFilter = "all" | TeacherStatus;

interface TeacherCardData {
  teacher: TeacherRecord;
  courses: ReturnType<typeof getTeacherCourses>;
  weekdays: number[];
  assignmentCount: number;
}

function sortTeachers(teachers: readonly TeacherRecord[]): TeacherRecord[] {
  return [...teachers].sort((left, right) => {
    if (left.status !== right.status) return left.status === "active" ? -1 : 1;
    return left.name.localeCompare(right.name, "zh-CN");
  });
}

function weekdayText(weekdays: readonly number[]): string {
  if (weekdays.length === 0) return "暂无排课";
  return weekdays.map((value) => WEEKDAYS.find((weekday) => weekday.value === value)?.label ?? `周${value}`).join("、");
}

interface TeacherDirectoryDraft {
  sourceSignature: string;
  entries: TimetableEntry[];
  teachers: TeacherRecord[];
  directoryDirty: boolean;
  timetableDirty: boolean;
}

function getTimetableSignature(data: TimetableApiResponse | null): string {
  if (!data) return "";
  return JSON.stringify({ courses: data.courses, entries: data.entries, slots: data.slots, teachers: data.teachers });
}

export function TeacherDirectory() {
  const { message, modal } = App.useApp();
  const router = useRouter();
  const { data, loading, error, refresh } = useApiData<TimetableApiResponse>("/api/timetable");
  const timetable = useMemo<TimetableData | null>(() => data ? normalizeTimetableData(data) : null, [data]);
  const sourceSignature = useMemo(() => getTimetableSignature(data), [data]);
  const [storedTeachers, setStoredTeachers] = useState<TeacherRecord[]>(() => readStoredTeachers());
  const [draft, setDraft] = useState<TeacherDirectoryDraft | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<TeacherFilter>("all");
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formSaving, setFormSaving] = useState(false);
  const [form] = Form.useForm<TeacherFormValues>();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setStoredTeachers(readStoredTeachers()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const baseEntries = timetable?.entries ?? [];
  const baseTeachers = useMemo(
    () => sortTeachers(mergeTeacherDirectory(baseEntries, storedTeachers, timetable?.teachers ?? [])),
    [baseEntries, storedTeachers, timetable?.teachers],
  );
  const activeDraft = draft?.sourceSignature === sourceSignature ? draft : null;
  const entries = activeDraft?.entries ?? baseEntries;
  const teachers = activeDraft?.teachers ?? baseTeachers;
  const directoryDirty = activeDraft?.directoryDirty ?? false;
  const timetableDirty = activeDraft?.timetableDirty ?? false;

  function updateDraft(nextEntries: TimetableEntry[], nextTeachers: TeacherRecord[], nextDirectoryDirty: boolean, nextTimetableDirty: boolean) {
    if (!sourceSignature) return;
    setDraft({
      sourceSignature,
      entries: nextEntries,
      teachers: nextTeachers,
      directoryDirty: nextDirectoryDirty,
      timetableDirty: nextTimetableDirty,
    });
  }

  const activeTeacherCount = teachers.filter((teacher) => teacher.status === "active").length;
  const assignedEntryCount = entries.filter((entry) => Boolean(entry.teacherName?.trim())).length;

  const teacherCards = useMemo<TeacherCardData[]>(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return teachers
      .map((teacher) => ({
        teacher,
        courses: getTeacherCourses(teacher, entries),
        weekdays: getTeacherWeekdays(teacher, entries),
        assignmentCount: entries.filter((entry) => entry.teacherName?.trim() === teacher.name).length,
      }))
      .filter(({ teacher, courses }) => {
        const matchesFilter = filter === "all" || teacher.status === filter;
        const matchesSearch = !normalizedQuery
          || teacher.name.toLowerCase().includes(normalizedQuery)
          || teacher.title.toLowerCase().includes(normalizedQuery)
          || courses.some((course) => course.name.toLowerCase().includes(normalizedQuery));
        return matchesFilter && matchesSearch;
      });
  }, [entries, filter, searchQuery, teachers]);

  const editingTeacher = editingTeacherId ? teachers.find((teacher) => teacher.id === editingTeacherId) : undefined;

  function openCreateModal() {
    setEditingTeacherId(null);
    form.resetFields();
    form.setFieldsValue({ title: "任课教师", status: "active" });
    setModalOpen(true);
  }

  function openEditModal(teacher: TeacherRecord) {
    setEditingTeacherId(teacher.id);
    form.setFieldsValue({
      name: teacher.name,
      title: teacher.title,
      phone: teacher.phone ?? undefined,
      email: teacher.email ?? undefined,
      status: teacher.status,
    });
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTeacherId(null);
    form.resetFields();
  }

  async function saveTeacherForm() {
    setFormSaving(true);
    try {
      const values = await form.validateFields();
      const name = values.name.trim();
      const duplicate = teachers.some((teacher) => teacher.name === name && teacher.id !== editingTeacherId);
      if (duplicate) {
        message.error("已有同名教师，请使用不同姓名");
        return;
      }

      const existingTeacher = editingTeacherId ? teachers.find((teacher) => teacher.id === editingTeacherId) : undefined;
      const nextTeacher: TeacherRecord = {
        id: existingTeacher?.id ?? `local-${Date.now()}`,
        name,
        title: values.title.trim() || "任课教师",
        phone: values.phone?.trim() || null,
        email: values.email?.trim() || null,
        status: values.status,
      };

      if (existingTeacher && existingTeacher.name !== name) {
        const nextEntries = entries.map((entry) => (
          entry.teacherName?.trim() === existingTeacher.name ? { ...entry, teacherName: name, teacherId: null } : entry
        ));
        updateDraft(nextEntries, sortTeachers([
          ...teachers.filter((teacher) => teacher.id !== nextTeacher.id),
          nextTeacher,
        ]), true, true);
      } else {
        updateDraft(entries, sortTeachers([
          ...teachers.filter((teacher) => teacher.id !== nextTeacher.id),
          nextTeacher,
        ]), true, timetableDirty);
      }
      closeModal();
      message.success(existingTeacher ? "教师资料已更新，记得保存目录" : "教师已加入目录，记得保存目录");
    } catch {
      // Ant Design keeps the validation message next to the invalid field.
    } finally {
      setFormSaving(false);
    }
  }

  function toggleTeacherStatus(teacher: TeacherRecord, checked: boolean) {
    updateDraft(entries, sortTeachers(teachers.map((item) => (
      item.id === teacher.id ? { ...item, status: checked ? "active" : "inactive" } : item
    ))), true, timetableDirty);
  }

  function removeTeacher(teacher: TeacherRecord) {
    const assignmentCount = entries.filter((entry) => entry.teacherName?.trim() === teacher.name).length;
    if (assignmentCount > 0) {
      message.warning(`“${teacher.name}”仍有 ${assignmentCount} 个课表安排，请先改派教师`);
      return;
    }

    modal.confirm({
      title: `删除${teacher.name}？`,
      content: "删除后需要重新添加才能恢复资料。",
      okText: "删除",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: () => {
        updateDraft(entries, teachers.filter((item) => item.id !== teacher.id), true, timetableDirty);
        message.success("教师已移出目录");
      },
    });
  }

  async function saveDirectory() {
    if (!timetable) return;
    setSaving(true);
    try {
      const nextTeachers = sortTeachers(mergeTeacherDirectory(entries, teachers));
      const shouldSaveTimetable = timetableDirty;

      if (data?.teachers !== undefined) {
        await apiRequest(TEACHER_DIRECTORY_ENDPOINT, {
          method: "PUT",
          body: JSON.stringify(toTeacherDirectoryWritePayload(nextTeachers)),
        });
      }

      if (shouldSaveTimetable) {
        await apiRequest<{ count: number }>("/api/timetable", {
          method: "PUT",
          body: JSON.stringify(toTimetableWritePayload(entries, { includeExtendedFields: data?.slots !== undefined })),
        });
      }

      persistTeachers(nextTeachers);
      setStoredTeachers(nextTeachers);
      if (shouldSaveTimetable) await refresh();
      setDraft(null);
      message.success("教师目录已保存");
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <PageHeading
        kicker="TEACHER DIRECTORY"
        title="任课教师维护"
        description="集中维护教师资料与课程关联，课表中的任课教师会同步显示在这里。"
        action={(
          <div className={styles.headingActions}>
            <Button icon={<ArrowLeftOutlined />} onClick={() => router.push("/timetable")}>返回课程表</Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>新增教师</Button>
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

      <section className={styles.summaryStrip} aria-label="教师目录概览">
        <div className={styles.summaryIntro}>
          <span className={styles.summaryIcon} aria-hidden="true"><TeamOutlined /></span>
          <div>
            <h2>班级任课团队</h2>
            <p>{data?.teachers !== undefined ? "教师目录已接入" : "从当前课表汇总任课信息"}</p>
          </div>
        </div>
        <div className={styles.summaryStats}>
          <div className={styles.summaryStat}><strong>{teachers.length}</strong><span>全部教师</span></div>
          <div className={styles.summaryStat}><strong>{activeTeacherCount}</strong><span>启用中</span></div>
          <div className={styles.summaryStat}><strong>{assignedEntryCount}</strong><span>任课安排</span></div>
        </div>
        <div className={styles.saveStatus}>
          <Tag color={directoryDirty || timetableDirty ? "gold" : "green"}>
            {directoryDirty || timetableDirty ? "有未保存修改" : "目录已同步"}
          </Tag>
          <Button
            type="primary"
            icon={<SaveOutlined />}
            loading={saving}
            disabled={!directoryDirty && !timetableDirty}
            onClick={() => void saveDirectory()}
          >
            保存目录
          </Button>
        </div>
      </section>

      <section className={styles.toolbar} aria-label="教师筛选">
        <Input
          allowClear
          className={styles.search}
          prefix={<SearchOutlined />}
          placeholder="搜索教师或课程"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
        />
        <Select
          className={styles.filter}
          aria-label="教师状态"
          value={filter}
          options={[
            { value: "all", label: "全部状态" },
            { value: "active", label: "启用中" },
            { value: "inactive", label: "已停用" },
          ]}
          onChange={(value) => setFilter(value as TeacherFilter)}
        />
        <span className={styles.resultCount}>显示 {teacherCards.length} / {teachers.length} 位教师</span>
      </section>

      {loading || !timetable ? (
        <section className={styles.loading}><Skeleton active paragraph={{ rows: 8 }} /></section>
      ) : teacherCards.length > 0 ? (
        <section className={styles.teacherGrid} aria-label="教师列表">
          {teacherCards.map(({ teacher, courses, weekdays, assignmentCount }) => (
            <article className={`${styles.teacherCard} ${teacher.status === "inactive" ? styles.teacherCardInactive : ""}`} key={teacher.id}>
              <header className={styles.teacherCardHeader}>
                <Avatar className={styles.teacherAvatar}>{getTeacherInitial(teacher.name)}</Avatar>
                <div className={styles.teacherIdentity}>
                  <div className={styles.teacherNameRow}>
                    <h2>{teacher.name}</h2>
                    <Tag color={teacher.status === "active" ? "green" : "default"}>{teacher.status === "active" ? "启用" : "停用"}</Tag>
                  </div>
                  <p>{teacher.title}</p>
                </div>
                <div className={styles.cardActions}>
                  <Tooltip title="编辑教师资料">
                    <Button type="text" aria-label={`编辑${teacher.name}`} icon={<EditOutlined />} onClick={() => openEditModal(teacher)} />
                  </Tooltip>
                  <Tooltip title="删除未分配教师">
                    <Button type="text" danger aria-label={`删除${teacher.name}`} icon={<DeleteOutlined />} onClick={() => removeTeacher(teacher)} />
                  </Tooltip>
                </div>
              </header>

              <div className={styles.teacherStats}>
                <div><strong>{courses.length}</strong><span>门课程</span></div>
                <div><strong>{assignmentCount}</strong><span>个安排</span></div>
                <div><strong>{weekdays.length}</strong><span>个工作日</span></div>
              </div>

              <div className={styles.assignmentSection}>
                <div className={styles.sectionLabel}><BookOutlined />任教课程</div>
                {courses.length > 0 ? (
                  <div className={styles.courseTags}>
                    {courses.map((course) => <Tag color={course.color} key={course.id}>{course.name}</Tag>)}
                  </div>
                ) : <span className={styles.muted}>尚未安排课程</span>}
                <div className={styles.scheduleText}><CalendarOutlined />{weekdayText(weekdays)}</div>
              </div>

              <div className={styles.contactSection}>
                <div className={styles.contactRow}>
                  <PhoneOutlined aria-hidden="true" />
                  {teacher.phone ? <a href={`tel:${teacher.phone}`}>{teacher.phone}</a> : <span className={styles.muted}>未填写手机号</span>}
                </div>
                <div className={styles.contactRow}>
                  <MailOutlined aria-hidden="true" />
                  {teacher.email ? <a href={`mailto:${teacher.email}`}>{teacher.email}</a> : <span className={styles.muted}>未填写邮箱</span>}
                </div>
              </div>

              <footer className={styles.teacherCardFooter}>
                <span className={styles.statusControl}>
                  {teacher.status === "active" ? <UserOutlined aria-hidden="true" /> : <StopOutlined aria-hidden="true" />}
                  <span>{teacher.status === "active" ? "教师可排课" : "教师已停用"}</span>
                </span>
                <Switch
                  size="small"
                  checked={teacher.status === "active"}
                  aria-label={`${teacher.name}启用状态`}
                  onChange={(checked) => toggleTeacherStatus(teacher, checked)}
                />
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <section className={styles.emptyState}>
          <Empty description={searchQuery || filter !== "all" ? "没有匹配的教师" : "还没有教师记录"} />
        </section>
      )}

      <Modal
        title={editingTeacher ? `编辑${editingTeacher.name}` : "新增教师"}
        open={modalOpen}
        onCancel={closeModal}
        onOk={() => void saveTeacherForm()}
        okText="保存资料"
        confirmLoading={formSaving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" requiredMark={false} style={{ marginTop: 18 }}>
          <Form.Item name="name" label="教师姓名" rules={[{ required: true, whitespace: true, message: "请输入教师姓名" }]}>
            <Input placeholder="例如：王老师" />
          </Form.Item>
          <Form.Item name="title" label="职务或任教方向" rules={[{ required: true, whitespace: true, message: "请输入职务或任教方向" }]}>
            <Input placeholder="例如：语文教师" />
          </Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ pattern: /^$|^[0-9+\-\s]{6,20}$/, message: "请输入有效手机号" }]}>
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: "email", message: "请输入有效邮箱" }]}>
            <Input placeholder="选填" />
          </Form.Item>
          <Form.Item name="status" label="状态" rules={[{ required: true, message: "请选择教师状态" }]}>
            <Select options={[{ value: "active", label: "启用中" }, { value: "inactive", label: "已停用" }]} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
