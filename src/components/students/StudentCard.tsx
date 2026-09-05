"use client";

import {
  EditOutlined,
  HomeOutlined,
  PhoneOutlined,
  RightOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Tag, Tooltip } from "antd";

import { resolveStudentGender } from "@/domain/student-gender";

import styles from "./students.module.css";
import { getPrimaryGuardian, statusMap, type Student } from "./types";

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
  const gender = resolveStudentGender(student.gender, student.name);

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
      <div className={styles.studentCardTop}>
        <div className={styles.studentCardHeader}>
          <div className={styles.studentIdentity}>
            <div
              className={`${styles.studentAvatar} ${styles[`studentAvatar${gender.value}`]}`}
              aria-hidden="true"
            >
              {student.name.slice(0, 1)}
            </div>
            <div className={styles.studentIdentityCopy}>
              <div className={styles.studentNameRow}>
                <h2 title={student.name}>{student.name}</h2>
                <Tag className={styles.studentStatusTag} color={status.color}>{status.text}</Tag>
              </div>
              <div className={styles.studentSubRow}>
                <span className={styles.studentNoBadge} title={`学号：${student.studentNo}`}>
                  {student.studentNo}
                </span>
                <span className={`${styles.genderMark} ${styles[`genderMark${gender.value}`]}`}>
                  {gender.value === "MALE" ? "♂" : gender.value === "FEMALE" ? "♀" : ""} {gender.label}
                </span>
                {gender.inferred && <span className={styles.genderInference} title="根据姓名自动推断">推断</span>}
              </div>
            </div>
          </div>
          <Tooltip title={`编辑${student.name}`}>
            <Button
              className={styles.studentCardEdit}
              type="text"
              size="small"
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
            <HomeOutlined className={styles.factIcon} aria-hidden="true" />
            <span className={styles.factLabel}>住宿：</span>
            <span className={styles.factValue}>{student.dormitory ? `宿舍 ${student.dormitory}` : "走读生"}</span>
          </div>
          <div className={styles.studentFact}>
            <PhoneOutlined className={styles.factIcon} aria-hidden="true" />
            <span className={styles.factLabel}>电话：</span>
            <span className={styles.factValue}>
              {student.phone ? (
                <a href={`tel:${student.phone}`} onClick={stopCardClick}>{student.phone}</a>
              ) : (
                <span className={styles.mutedText}>未登记电话</span>
              )}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.studentContactSummary}>
        <div className={styles.studentContactLead}>
          <div className={styles.studentContactIcon} aria-hidden="true">
            <UserOutlined />
          </div>
          <div className={styles.studentContactCopy}>
            <span className={styles.studentContactLabel}>第一监护人</span>
            <strong className={styles.studentContactName}>
              {guardian ? `${guardian.name} · ${guardian.relationship}` : "未登记联系人"}
            </strong>
          </div>
        </div>
        <div className={styles.studentDetailHint} title="查看档案">
          <RightOutlined className={styles.studentCardArrow} aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}
