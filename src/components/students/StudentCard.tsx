"use client";

import {
  EditOutlined,
  HomeOutlined,
  PhoneOutlined,
  RightOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Tag, Tooltip } from "antd";

import styles from "./students.module.css";
import { genderMap, getPrimaryGuardian, statusMap, type Student } from "./types";

interface StudentCardProps {
  student: Student;
  onOpenDetail: (student: Student) => void;
  onEdit: (student: Student) => void;
}

function stopCardClick(event: React.MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function StudentCard({ student, onOpenDetail, onEdit }: StudentCardProps) {
  const guardian = getPrimaryGuardian(student);
  const status = statusMap[student.status];

  function openFromKeyboard(event: React.KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpenDetail(student);
    }
  }

  return (
    <article
      className={styles.studentCard}
      role="button"
      tabIndex={0}
      onClick={() => onOpenDetail(student)}
      onKeyDown={openFromKeyboard}
      aria-label={`查看${student.name}的学生档案`}
    >
      <div className={styles.studentCardHeader}>
        <div className={styles.studentIdentity}>
          <div className={styles.studentAvatar} aria-hidden="true">
            {student.name.slice(0, 1)}
          </div>
          <div className={styles.studentIdentityCopy}>
            <div className={styles.studentNameRow}>
              <h2>{student.name}</h2>
              <Tag color={status.color}>{status.text}</Tag>
            </div>
            <p>{student.studentNo} · {genderMap[student.gender]}</p>
          </div>
        </div>
        <Tooltip title={`编辑${student.name}`}>
          <Button
            className={styles.studentCardEdit}
            type="text"
            icon={<EditOutlined />}
            aria-label={`编辑${student.name}`}
            onClick={(event) => {
              stopCardClick(event);
              onEdit(student);
            }}
          />
        </Tooltip>
      </div>

      <div className={styles.studentFacts}>
        <div className={styles.studentFact}>
          <HomeOutlined aria-hidden="true" />
          <span>{student.dormitory ? `宿舍 ${student.dormitory}` : "走读"}</span>
        </div>
        <div className={styles.studentFact}>
          <PhoneOutlined aria-hidden="true" />
          {student.phone ? (
            <a href={`tel:${student.phone}`} onClick={stopCardClick}>{student.phone}</a>
          ) : (
            <span className={styles.mutedText}>未填写电话</span>
          )}
        </div>
      </div>

      <div className={styles.studentContactSummary}>
        <div className={styles.studentContactIcon} aria-hidden="true">
          <UserOutlined />
        </div>
        <div className={styles.studentContactCopy}>
          <span>主联系人</span>
          <strong>{guardian ? `${guardian.name} · ${guardian.relationship}` : "未维护联系人"}</strong>
        </div>
        <RightOutlined className={styles.studentCardArrow} aria-hidden="true" />
      </div>
    </article>
  );
}

