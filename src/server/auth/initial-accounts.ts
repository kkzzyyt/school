export const DEFAULT_INITIAL_PASSWORD = "123456";

export const INITIAL_ACCOUNTS = {
  administrator: {
    username: "admin",
    displayName: "系统管理员",
    role: "ADMIN",
  },
  headTeacher: {
    username: "mx",
    displayName: "周老师",
    role: "HEAD_TEACHER",
  },
} as const;
