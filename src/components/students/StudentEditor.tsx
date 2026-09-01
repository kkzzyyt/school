"use client";

import {
  DeleteOutlined,
  PlusOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { App, Button, Col, DatePicker, Drawer, Form, Input, Radio, Row, Select, Tag } from "antd";
import dayjs from "dayjs";
import { useState } from "react";

import { apiRequest } from "@/lib/api";

import styles from "./students.module.css";
import {
  genderMap,
  statusMap,
  studentStatusValues,
  type GuardianFormValues,
  type Student,
  type StudentFormValues,
} from "./types";

interface StudentEditorProps {
  student: Student | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}

function optionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized || null;
}

function studentInitialValues(student: Student | null): Partial<StudentFormValues> {
  if (!student) {
    return { gender: "MALE", status: "ACTIVE", guardians: [] };
  }

  return {
    studentNo: student.studentNo,
    name: student.name,
    gender: student.gender,
    birthDate: student.birthDate ? dayjs(student.birthDate) : undefined,
    phone: student.phone ?? undefined,
    address: student.address ?? undefined,
    dormitory: student.dormitory ?? undefined,
    status: student.status,
    notes: student.notes ?? undefined,
    guardians: student.guardians.map((guardian) => ({
      name: guardian.name,
      relationship: guardian.relationship,
      phone: guardian.phone,
      wechat: guardian.wechat ?? undefined,
      workplace: guardian.workplace ?? undefined,
    })),
  };
}

export function StudentEditor({ student, open, onClose, onSaved }: StudentEditorProps) {
  const { message } = App.useApp();
  const [form] = Form.useForm<StudentFormValues>();
  const [saving, setSaving] = useState(false);
  const [primaryIndex, setPrimaryIndex] = useState(() => (
    student ? student.guardians.findIndex((guardian) => guardian.isPrimary) : -1
  ));

  function closeEditor(force = false) {
    if (saving && !force) return;
    form.resetFields();
    setPrimaryIndex(-1);
    onClose();
  }

  function addGuardian(add: (defaultValue?: GuardianFormValues) => void, currentCount: number) {
    add({});
    if (primaryIndex < 0) setPrimaryIndex(currentCount);
  }

  function removeGuardian(remove: (index: number) => void, index: number) {
    remove(index);
    setPrimaryIndex((current) => {
      if (current === index) return -1;
      return current > index ? current - 1 : current;
    });
  }

  async function saveStudent() {
    let values: StudentFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const guardians = (values.guardians ?? []).map((guardian, index) => ({
        name: guardian.name?.trim() ?? "",
        relationship: guardian.relationship?.trim() ?? "",
        phone: guardian.phone?.trim() ?? "",
        wechat: optionalText(guardian.wechat),
        workplace: optionalText(guardian.workplace),
        isPrimary: index === primaryIndex,
      }));
      const payload = {
        studentNo: values.studentNo.trim(),
        name: values.name.trim(),
        gender: values.gender,
        birthDate: values.birthDate?.format("YYYY-MM-DD") ?? null,
        phone: optionalText(values.phone),
        address: optionalText(values.address),
        dormitory: optionalText(values.dormitory),
        status: values.status,
        notes: optionalText(values.notes),
        guardians,
      };

      await apiRequest(student ? `/api/students/${student.id}` : "/api/students", {
        method: student ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      message.success(student ? "学生资料已更新" : "学生已加入花名册");
      await onSaved();
      closeEditor(true);
    } catch (saveError) {
      message.error((saveError as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      className={styles.studentDrawer}
      title={student ? `编辑学生 · ${student.name}` : "新增学生"}
      placement="right"
      size="min(100vw, 720px)"
      open={open}
      onClose={() => closeEditor()}
      destroyOnHidden
      styles={{ body: { padding: 0 }, footer: { padding: "12px 20px" } }}
      footer={(
        <div className={styles.studentEditorFooter}>
          <Button onClick={() => closeEditor()} disabled={saving}>取消</Button>
          <Button type="primary" loading={saving} onClick={() => void saveStudent()}>保存资料</Button>
        </div>
      )}
    >
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        className={styles.studentEditorForm}
        initialValues={studentInitialValues(student)}
      >
        <section className={styles.studentEditorSection}>
          <div className={styles.studentEditorSectionHeading}>
            <div>
              <h2>学生信息</h2>
              <p>基础资料和当前学籍状态</p>
            </div>
            <UserOutlined aria-hidden="true" />
          </div>
          <Row gutter={[12, 0]}>
            <Col xs={24} sm={12}>
              <Form.Item name="studentNo" label="学号" rules={[{ required: true, message: "请输入学号" }]}>
                <Input placeholder="请输入学号" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="name" label="姓名" rules={[{ required: true, message: "请输入姓名" }]}>
                <Input placeholder="请输入姓名" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="gender" label="性别" rules={[{ required: true, message: "请选择性别" }]}>
                <Select options={Object.entries(genderMap).map(([value, label]) => ({ value, label }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="birthDate" label="出生日期">
                <DatePicker style={{ width: "100%" }} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="status" label="学籍状态" rules={[{ required: true, message: "请选择学籍状态" }]}>
                <Select options={studentStatusValues.map((value) => ({ value, label: statusMap[value].text }))} />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item
                name="phone"
                label="学生电话"
                rules={[{ pattern: /^1\d{10}$/, message: "请输入 11 位手机号" }]}
              >
                <Input placeholder="可选" inputMode="tel" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="dormitory" label="住宿信息">
                <Input placeholder="留空表示走读" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="address" label="家庭住址">
                <Input placeholder="请输入家庭住址" />
              </Form.Item>
            </Col>
            <Col xs={24}>
              <Form.Item name="notes" label="备注">
                <Input.TextArea rows={3} placeholder="补充需要关注的学生信息" maxLength={500} showCount />
              </Form.Item>
            </Col>
          </Row>
        </section>

        <section className={styles.studentEditorSection}>
          <div className={styles.studentEditorSectionHeading}>
            <div>
              <h2>联系人</h2>
              <p>可维护多位联系人，并设置一位主联系人</p>
            </div>
            <Tag>最多 5 位</Tag>
          </div>
          <Form.List name="guardians">
            {(fields, { add, remove }) => (
              <>
                {fields.length === 0 ? (
                  <div className={styles.studentEditorEmptyContacts}>
                    <span>尚未添加联系人</span>
                  </div>
                ) : (
                  <Radio.Group
                    className={styles.studentEditorContactList}
                    value={primaryIndex >= 0 ? primaryIndex : undefined}
                    onChange={(event) => setPrimaryIndex(event.target.value as number)}
                  >
                    {fields.map((field, index) => (
                      <div className={styles.studentEditorContact} key={field.key}>
                        <div className={styles.studentEditorContactHeading}>
                          <div>
                            <span>联系人 {index + 1}</span>
                            {primaryIndex === index && <Tag color="gold">主联系人</Tag>}
                          </div>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            aria-label={`删除联系人 ${index + 1}`}
                            onClick={() => removeGuardian(remove, index)}
                          />
                        </div>
                        <Row gutter={[12, 0]}>
                          <Col xs={24} sm={12}>
                            <Form.Item
                              {...field}
                              name={[field.name, "name"]}
                              label="姓名"
                              rules={[{ required: true, message: "请输入联系人姓名" }]}
                            >
                              <Input placeholder="如：张老师" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Form.Item
                              {...field}
                              name={[field.name, "relationship"]}
                              label="关系"
                              rules={[{ required: true, message: "请输入与学生关系" }]}
                            >
                              <Input placeholder="如：父亲" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Form.Item
                              {...field}
                              name={[field.name, "phone"]}
                              label="手机号"
                              rules={[
                                { required: true, message: "请输入联系人手机号" },
                                { pattern: /^1\d{10}$/, message: "请输入 11 位手机号" },
                              ]}
                            >
                              <Input placeholder="请输入 11 位手机号" inputMode="tel" />
                            </Form.Item>
                          </Col>
                          <Col xs={24} sm={12}>
                            <Form.Item {...field} name={[field.name, "wechat"]} label="微信号">
                              <Input placeholder="可选" />
                            </Form.Item>
                          </Col>
                          <Col xs={24}>
                            <Form.Item {...field} name={[field.name, "workplace"]} label="工作单位">
                              <Input placeholder="可选" />
                            </Form.Item>
                          </Col>
                          <Col xs={24}>
                            <Radio value={index}>设为主联系人</Radio>
                          </Col>
                        </Row>
                      </div>
                    ))}
                  </Radio.Group>
                )}
                <Button
                  className={styles.addGuardianButton}
                  icon={<PlusOutlined />}
                  onClick={() => addGuardian(add, fields.length)}
                  disabled={fields.length >= 5}
                >
                  添加联系人
                </Button>
              </>
            )}
          </Form.List>
        </section>
      </Form>
    </Drawer>
  );
}
