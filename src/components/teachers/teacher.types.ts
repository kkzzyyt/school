export type TeacherStatus = "active" | "inactive";

export interface TeacherRecord {
  id: string;
  name: string;
  title: string;
  phone: string | null;
  email: string | null;
  status: TeacherStatus;
}

export interface TeacherFormValues {
  name: string;
  title: string;
  phone?: string;
  email?: string;
  status: TeacherStatus;
}

export interface TeacherApiRecord {
  id?: string;
  name: string;
  title?: string | null;
  phone?: string | null;
  email?: string | null;
  status?: TeacherStatus | string;
}

export interface TeacherDirectoryResponse {
  teachers: TeacherApiRecord[];
}

export interface TeacherDirectoryWriteItem {
  id?: string;
  name: string;
  title: string;
  phone: string | null;
  email: string | null;
  status: TeacherStatus;
}

export interface TeacherDirectoryWritePayload {
  items: TeacherDirectoryWriteItem[];
}
