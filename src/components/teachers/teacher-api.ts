import type { TeacherDirectoryWritePayload, TeacherRecord } from "@/components/teachers/teacher.types";

export const TEACHER_DIRECTORY_ENDPOINT = "/api/teachers";

/**
 * Contract for the teacher resource planned for the next API version.
 * The current timetable endpoint remains the source of truth until it is available.
 */
export function toTeacherDirectoryWritePayload(teachers: readonly TeacherRecord[]): TeacherDirectoryWritePayload {
  return {
    items: teachers.map((teacher) => ({
      id: teacher.id,
      name: teacher.name,
      title: teacher.title,
      phone: teacher.phone,
      email: teacher.email,
      status: teacher.status,
    })),
  };
}
