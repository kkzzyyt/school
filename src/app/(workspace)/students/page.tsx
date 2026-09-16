"use client";

import { PlusOutlined, ReloadOutlined, SearchOutlined, TeamOutlined } from "@ant-design/icons";
import { Alert, Button, Input } from "antd";
import { Suspense, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { LedgerSheet } from "@/components/layout/LedgerSheet";
import { useApiData } from "@/hooks/useApiData";

import { StudentDetailDrawer } from "@/components/students/StudentDetailDrawer";
import { StudentEditor } from "@/components/students/StudentEditor";
import { StudentList } from "@/components/students/StudentList";
import styles from "@/components/students/students.module.css";
import type { Student, StudentResponse } from "@/components/students/types";

function StudentPageFallback() {
  return (
    <div className={styles.studentsPage}>
      <LedgerSheet
        kicker="STUDENT ROSTER"
        title="学生花名册"
        description="班级在校学生基本信息和家长联系人档案。"
        metrics={[{ label: "REGISTRY // 在校学生", value: "—", unit: "人", detail: "正在读取档案", icon: <TeamOutlined /> }]}
      >
        <section className={styles.rosterPanel} aria-busy="true">
          <div className={styles.toolbar}>
            <div className={styles.searchWrap} />
          </div>
          <div className={styles.studentListState}>正在准备学生名单...</div>
        </section>
      </LedgerSheet>
    </div>
  );
}

function StudentsPageContent() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("search") ?? searchParams.get("q") ?? "";
  const [detailStudent, setDetailStudent] = useState<Student | null>(null);
  const [editorStudent, setEditorStudent] = useState<Student | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);

  const requestUrl = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "100" });
    if (query.trim()) params.set("q", query.trim());
    return `/api/students?${params.toString()}`;
  }, [query]);

  const { data, loading, error, refresh } = useApiData<StudentResponse>(requestUrl);
  const hasFilters = Boolean(query.trim());

  function replaceFilters(next: { search?: string }) {
    const nextSearchParams = new URLSearchParams(searchParams.toString());
    if (next.search !== undefined) {
      const normalized = next.search.trim();
      if (normalized) nextSearchParams.set("search", normalized);
      else nextSearchParams.delete("search");
      nextSearchParams.delete("q");
    }
    nextSearchParams.delete("status");
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
    replaceFilters({ search: "" });
  }

  async function saveComplete() {
    await refresh();
  }

  return (
    <div className={styles.studentsPage}>
      <LedgerSheet
        kicker="STUDENT ROSTER"
        title="学生花名册"
        description="班级在校学生基本信息和家长联系人档案。"
        actions={(
          <div className={styles.headingAction}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor()}>
              新增学生
            </Button>
          </div>
        )}
        metrics={[
          {
            label: "REGISTRY // 班级在校",
            value: data?.meta.total ?? "—",
            unit: "人",
            detail: hasFilters ? "当前搜索结果" : "按学号顺序展示",
            icon: <TeamOutlined />,
          },
        ]}
      >
        {error && (
          <Alert
            type="error"
            showIcon
            title={error.message}
            action={<Button type="text" icon={<ReloadOutlined />} onClick={() => void refresh()}>重试</Button>}
          />
        )}

        <section className={styles.rosterPanel}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <Input.Search
                key={query}
                allowClear
                enterButton={<SearchOutlined />}
                defaultValue={query}
                placeholder="搜索姓名或学号"
                aria-label="搜索姓名或学号"
                onChange={(event) => {
                  if (!event.target.value) replaceFilters({ search: "" });
                }}
                onSearch={(value) => replaceFilters({ search: value })}
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
              {hasFilters ? <span>搜索“{query.trim()}”</span> : <span>按学号顺序展示</span>}
            </div>
            {hasFilters && (
              <Button type="link" onClick={clearFilters}>清除筛选</Button>
            )}
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
      </LedgerSheet>

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
