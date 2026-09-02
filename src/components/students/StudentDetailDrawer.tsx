"use client";

import {
  CalendarOutlined,
  EditOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  StarFilled,
  UserOutlined,
} from "@ant-design/icons";
import { Button, Drawer, Empty, Tag, Tooltip } from "antd";
import dayjs from "dayjs";

import { resolveStudentGender } from "@/domain/student-gender";

import styles from "./students.module.css";
import { statusMap, type Student } from "./types";

interface StudentDetailDrawerProps {
  student: Student | null;
  open: boolean;
  onClose: () => void;
  onEdit: (student: Student) => void;
}

function displayValue(value: string | null | undefined) {
  return value || "未填写";
}

export function StudentDetailDrawer({ student, open, onClose, onEdit }: StudentDetailDrawerProps) {
  if (!student) return null;

  const status = statusMap[student.status];
  const gender = resolveStudentGender(student.gender, student.name);

  return (
    <Drawer
      className={styles.studentDrawer}
      title={(
        <div className={styles.drawerTitle}>
          <span>学生档案</span>
          <span className={styles.mutedText}>{student.studentNo}</span>
        </div>
      )}
      extra={(
        <Tooltip title="编辑学生资料">
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`编辑${student.name}的学生资料`}
            onClick={() => onEdit(student)}
          />
        </Tooltip>
      )}
      placement="right"
      size="min(100vw, 620px)"
      open={open}
      onClose={onClose}
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      <div className={styles.studentDetail}>
        <section className={styles.studentDetailHero}>
          <div className={styles.studentDetailAvatar} aria-hidden="true">{student.name.slice(0, 1)}</div>
          <div className={styles.studentDetailHeroCopy}>
            <div className={styles.studentDetailNameRow}>
              <h2>{student.name}</h2>
              <Tag color={status.color}>{status.text}</Tag>
            </div>
            <p>
              {gender.label}{gender.inferred ? " · 根据姓名推断" : ""} · {student.studentNo}
            </p>
          </div>
        </section>

        <section className={styles.studentDetailSection}>
          <div className={styles.studentSectionHeading}>
            <h3>基本资料</h3>
            <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(student)}>编辑</Button>
          </div>
          <dl className={styles.studentDetailGrid}>
            <div>
              <dt>出生日期</dt>
              <dd>{student.birthDate ? dayjs(student.birthDate).format("YYYY-MM-DD") : "未填写"}</dd>
            </div>
            <div>
              <dt>联系电话</dt>
              <dd>
                {student.phone ? <a href={`tel:${student.phone}`}>{student.phone}</a> : "未填写"}
              </dd>
            </div>
            <div>
              <dt>住宿信息</dt>
              <dd>{student.dormitory ? `宿舍 ${student.dormitory}` : "走读"}</dd>
            </div>
            <div>
              <dt>学籍状态</dt>
              <dd><Tag color={status.color}>{status.text}</Tag></dd>
            </div>
          </dl>
          <div className={styles.studentDetailLongField}>
            <span><EnvironmentOutlined aria-hidden="true" /> 家庭住址</span>
            <p>{displayValue(student.address)}</p>
          </div>
          {student.notes && (
            <div className={styles.studentDetailLongField}>
              <span><EditOutlined aria-hidden="true" /> 备注</span>
              <p>{student.notes}</p>
            </div>
          )}
        </section>

        <section className={styles.studentDetailSection}>
          <div className={styles.studentSectionHeading}>
            <div>
              <h3>联系人</h3>
              <span>{student.guardians.length} 位联系人</span>
            </div>
            <Button type="link" icon={<EditOutlined />} onClick={() => onEdit(student)}>维护</Button>
          </div>
          {student.guardians.length === 0 ? (
            <div className={styles.studentDetailEmptyContact}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无联系人" />
            </div>
          ) : (
            <div className={styles.studentDetailContacts}>
              {student.guardians.map((guardian) => (
                <div className={styles.studentDetailContact} key={guardian.id}>
                  <div className={styles.studentContactAvatar} aria-hidden="true"><UserOutlined /></div>
                  <div className={styles.studentDetailContactCopy}>
                    <div className={styles.studentDetailContactName}>
                      <strong>{guardian.name}</strong>
                      <span>{guardian.relationship}</span>
                      {guardian.isPrimary && <Tag icon={<StarFilled />} color="gold">主联系人</Tag>}
                    </div>
                    <a href={`tel:${guardian.phone}`} className={styles.studentDetailContactPhone}>
                      <PhoneOutlined aria-hidden="true" /> {guardian.phone}
                    </a>
                    {(guardian.wechat || guardian.workplace) && (
                      <p>{guardian.wechat ? `微信：${guardian.wechat}` : ""}{guardian.wechat && guardian.workplace ? " · " : ""}{guardian.workplace ? `单位：${guardian.workplace}` : ""}</p>
                    )}
                  </div>
                  <Tooltip title={`拨打${guardian.name}`}>
                    <Button
                      type="text"
                      icon={<PhoneOutlined />}
                      href={`tel:${guardian.phone}`}
                      aria-label={`拨打${guardian.name}`}
                    />
                  </Tooltip>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className={styles.studentDetailFooter}>
          <CalendarOutlined aria-hidden="true" />
          <span>资料由花名册统一维护</span>
        </div>
      </div>
    </Drawer>
  );
}
