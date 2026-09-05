"use client";

import { ReloadOutlined } from "@ant-design/icons";
import { Button, Empty, Skeleton } from "antd";

import styles from "./students.module.css";
import { StudentCard } from "./StudentCard";
import type { Student } from "./types";

interface StudentListProps {
  students: Student[];
  loading: boolean;
  error: Error | null;
  hasFilters: boolean;
  onOpenDetail: (student: Student) => void;
  onEdit: (student: Student) => void;
  onClearFilters: () => void;
  onRetry: () => void;
}

function LoadingGrid() {
  return (
    <div className={styles.studentGrid} aria-busy="true" aria-label="正在加载学生名单">
      {Array.from({ length: 8 }, (_, index) => (
        <div className={`${styles.studentCard} ${styles.studentCardLoading}`} key={`student-skeleton-${index}`}>
          <Skeleton active avatar paragraph={{ rows: 3 }} />
        </div>
      ))}
    </div>
  );
}

export function StudentList({
  students,
  loading,
  error,
  hasFilters,
  onOpenDetail,
  onEdit,
  onClearFilters,
  onRetry,
}: StudentListProps) {
  if (loading && students.length === 0) return <LoadingGrid />;

  if (error && students.length === 0) {
    return (
      <div className={styles.studentListState}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="学生名单加载失败">
          <Button type="primary" icon={<ReloadOutlined />} onClick={onRetry}>重新加载</Button>
        </Empty>
      </div>
    );
  }

  if (students.length === 0) {
    return (
      <div className={styles.studentListState}>
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={hasFilters ? "没有符合条件的学生" : "暂无学生记录"}
        >
          {hasFilters && <Button onClick={onClearFilters}>清除筛选</Button>}
        </Empty>
      </div>
    );
  }

  return (
    <div className={`${styles.studentGrid} ${loading ? styles.studentGridRefreshing : ""}`} aria-busy={loading}>
      {students.map((student) => (
        <StudentCard
          key={student.id}
          student={student}
          onOpenDetail={onOpenDetail}
          onEdit={onEdit}
        />
      ))}
    </div>
  );
}

