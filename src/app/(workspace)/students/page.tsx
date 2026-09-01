"use client";

import { PlusOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Input, Segmented, Tag } from "antd";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { PageHeading } from "@/components/layout/PageHeading";
import { useApiData } from "@/hooks/useApiData";

import { StudentDetailDrawer } from "@/components/students/StudentDetailDrawer";
import { StudentEditor } from "@/components/students/StudentEditor";
import { StudentList } from "@/components/students/StudentList";
import styles from "@/components/students/students.module.css";
import {
  isStudentStatus,
  statusMap,
  type Student,
  type StudentResponse,
  type StudentStatus,
} from "@/components/students/types";

type StatusFilter = StudentStatus | "ALL";

const statusOptions: Array<{ label: string; value: StatusFilter }> = [
  { label: "全部", value: "ALL" },
  ...(["ACTIVE", "SUSPENDED", "TRANSFERRED", "GRADUATED"] as StudentStatus[]).map((value) => ({
    label: statusMap[value].text,
    value,
  })),
];

function StudentPageFallback() {
  return (
    <div className={styles.studentsPage}>
      <PageHeading
        kicker="STUDENT ROSTER"
        title="学生花名册"
        description="统一维护学生基本信息、学籍状态和联系人。"
      />
      <div className={`surface-card ${styles.rosterPanel}`} aria-busy="true">
        <div className={styles.toolbar}>
          <div className={styles.searchWrap} />
          <div className={styles.filterWrap} />
        </div>
        <div className={styles.studentListState}>正在准备学生名单...</div>
      </div>
    </div>
  );
}

function StudentsPageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("search") ?? searchParams.get("q") ?? "";
  const rawStatus = searchParams.get("status");
  const status = isStudentStatus(rawStatus) ? rawStatus : "ALL";
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [editorStudent, setEditorStudent] = useState<Student | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (query.trim()) params.set("q", query.trim());
    if (status !== "ALL") params.set("status", status);
    return `/api/students?${params.toString()}`;
  }, [query, status]);

  const { data, loading, error, refresh } = useApiData<StudentResponse>(requestUrl);
  const hasFilters = Boolean(query.trim()) || status !== "ALL";

  function replaceFilters(next: { search?: string; status?: StatusFilter }) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (next.search !== undefined) {
      const normalized = next.search.trim();
      if (normalized) nextSearchParams.set("search", normalized);
      else nextSearchParams.delete("search");
      nextSearchParams.delete("q");
    }
    if (next.status !== undefined) {
      if (next.status === "ALL") nextSearchParams.delete("status");
      else nextSearchParams.set("status", next.status);
    }
    const nextQuery = nextSearchParams.toString();
    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ""}`, { scroll: false });
  }

  function openDetail(student: Student) {
    setDetailStudent(student);
    setDetailOpen(true);
  }

  function openEditor(student?: Student) {
    setEditorStudent(student ?? null);
    setDetailOpen(false);
    setEditorOpen(true);
  }

  function closeDetail() {
    setDetailOpen(false);
    setDetailStudent(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditorStudent(null);
  }

  function clearFilters() {
    replaceFilters({ search: "", status: "ALL" });
  }

  async function saveComplete() {
    await refresh();
  }

  return (
    <div className={styles.studentsPage}>
      <PageHeading
        kicker="STUDENT ROSTER"
        title="学生花名册"
        description="统一维护学生基本信息、学籍状态和联系人。"
        action={(
          <div className={styles.headingAction}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              新增学生
            </Button>
          </div>
        )}
      />

      {error && (
        <Alert
          type="error"
          showIcon
          title={error.message}
          action={<Button type="text" icon={<ReloadOutlined />} onClick={() => void refresh()}>重试</Button>}
        />
      )}

      <section className={`surface-card ${styles.rosterPanel}`}>
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <Input.Search
              key={query}
              allowClear
              enterButton
              defaultValue={query}
              prefix={<SearchOutlined />}
              placeholder="搜索姓名或学号"
              aria-label="搜索姓名或学号"
              onChange={(event) => {
                if (!event.target.value) replaceFilters({ search: "" });
              }}
              onSearch={(value) => replaceFilters({ search: value })}
            />
          </div>
          <div className={styles.filterWrap}>
            <span className={styles.filterLabel}>学籍状态</span>
            <Segmented<StatusFilter>
              className={styles.statusSegmented}
              block
              options={statusOptions}
              value={status}
              onChange={(value) => replaceFilters({ status: value })}
            />
          </div>
        </div>

        <div className={styles.rosterMeta}>
          <div className={styles.rosterCount}>
            <strong>{data ? data.meta.total : "—"}</strong>
            <span>{hasFilters ? "名匹配学生" : "名学生"}</span>
          </div>
          <div className={styles.rosterMetaDetails}>
            <TeamOutlined aria-hidden="true" />
            {query.trim() && <span>搜索“{query.trim()}”</span>}
            {status !== "ALL" && <Tag color={statusMap[status].color}>{statusMap[status].text}</Tag>}
            {!hasFilters && <span>按学号顺序展示</span>}
          </div>
          <Button type="link" disabled={!hasFilters} onClick={clearFilters}>清除筛选</Button>
        </div>

        <StudentList
          students={data?.items ?? []}
          loading={loading}
          error={error}
          hasFilters={hasFilters}
          onOpenDetail={openDetail}
          onEdit={openEditor}
          onClearFilters={clearFilters}
          onRetry={() => void refresh()}
        />
      </section>

      <StudentDetailDrawer
        student={detailStudent}
        open={detailOpen}
        onClose={closeDetail}
        onEdit={openEditor}
      />
      <StudentEditor
        key={`${editorStudent?.id ?? "new"}-${editorOpen ? "open" : "closed"}`}
        student={editorStudent}
        open={editorOpen}
        onClose={closeEditor}
        onSaved={saveComplete}
      />
    </div>
  );
}

export default function StudentsPage() {
  return (
    <Suspense fallback={<StudentPageFallback />}>
      <StudentsPageContent />
    </Suspense>
  );
}
