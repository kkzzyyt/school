import type { Dayjs } from "dayjs";

export const studentStatusValues = [
  "ACTIVE",
  "SUSPENDED",
  "TRANSFERRED",
  "GRADUATED",
] as const;

export type StudentStatus = (typeof studentStatusValues)[number];
export type StudentGender = "MALE" | "FEMALE" | "OTHER";

export interface Guardian {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  wechat: string | null;
  workplace: string | null;
  isPrimary: boolean;
}

export interface Student {
  id: string;
  studentNo: string;
  name: string;
  gender: StudentGender;
  birthDate: string | null;
  phone: string | null;
  address: string | null;
  dormitory: string | null;
  status: StudentStatus;
  notes?: string | null;
  updatedAt?: string;
  guardians: Guardian[];
}

export interface StudentResponse {
  items: Student[];
  meta: { total: number; page: number; pageSize: number };
}

export interface GuardianFormValues {
  name?: string;
  relationship?: string;
  phone?: string;
  wechat?: string;
  workplace?: string;
}

export interface StudentFormValues {
  studentNo: string;
  name: string;
  gender: StudentGender;
  birthDate?: Dayjs;
  phone?: string;
  address?: string;
  dormitory?: string;
  status: StudentStatus;
  notes?: string;
  guardians?: GuardianFormValues[];
}

export const statusMap: Record<StudentStatus, { text: string; color: string }> = {
  ACTIVE: { text: "在读", color: "green" },
  SUSPENDED: { text: "休学", color: "orange" },
  TRANSFERRED: { text: "转出", color: "default" },
  GRADUATED: { text: "毕业", color: "blue" },
};

export const genderMap: Record<StudentGender, string> = {
  MALE: "男",
  FEMALE: "女",
  OTHER: "其他",
};

export function getPrimaryGuardian(student: Student) {
  return student.guardians.find((guardian) => guardian.isPrimary) ?? student.guardians[0];
}

export function isStudentStatus(value: string | null): value is StudentStatus {
  return value !== null && studentStatusValues.includes(value as StudentStatus);
}

