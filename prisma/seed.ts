import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { hash } from "argon2";

import {
  ExamStatus,
  Gender,
  MembershipRole,
  PrismaClient,
  Semester,
  UserRole,
} from "../src/generated/prisma/client";
import {
  DEFAULT_SEATING_AISLE_COLUMNS,
  DEFAULT_SEATING_COLUMNS,
  DEFAULT_SEATING_ROWS,
} from "../src/domain/seating";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to seed the database");
}

const prisma = new PrismaClient({ adapter: new PrismaMariaDb(databaseUrl) });

const studentNames = [
  "陈晨",
  "林溪",
  "周屿",
  "许知夏",
  "江明远",
  "苏念",
  "顾言",
  "沈星河",
  "陆嘉禾",
  "宋予安",
  "唐可欣",
  "叶景行",
  "温书宁",
  "秦朗",
  "谢婉清",
  "梁逸舟",
  "程若曦",
  "韩子墨",
  "傅清欢",
  "罗一鸣",
  "孟晚晴",
  "邵云深",
  "白芷",
  "季川",
];

const courseDefinitions = [
  ["语文", "#4f6f52"],
  ["数学", "#d97745"],
  ["英语", "#5375a5"],
  ["物理", "#7566a8"],
  ["化学", "#2f8f83"],
  ["生物", "#6d9449"],
  ["历史", "#a46b56"],
  ["体育", "#ca7256"],
  ["班会", "#9b7a45"],
] as const;

const assignableSeatColumns = Array.from(
  { length: DEFAULT_SEATING_COLUMNS },
  (_, index) => index + 1,
).filter((column) => !DEFAULT_SEATING_AISLE_COLUMNS.includes(column));

async function resetDatabase() {
  await prisma.auditLog.deleteMany();
  await prisma.session.deleteMany();
  await prisma.score.deleteMany();
  await prisma.examSubject.deleteMany();
  await prisma.exam.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.timetableEntry.deleteMany();
  await prisma.course.deleteMany();
  await prisma.committeeMember.deleteMany();
  await prisma.dutyAssignment.deleteMany();
  await prisma.dutyGroup.deleteMany();
  await prisma.seatAssignment.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.student.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.classMembership.deleteMany();
  await prisma.classroom.deleteMany();
  await prisma.user.deleteMany();
}

async function seed() {
  await resetDatabase();

  const teacher = await prisma.user.create({
    data: {
      username: "teacher",
      passwordHash: await hash("Teacher@123", { type: 2 }),
      displayName: "周老师",
      role: UserRole.HEAD_TEACHER,
    },
  });

  const admin = await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: await hash("admin123", { type: 2 }),
      displayName: "系统管理员",
      role: UserRole.ADMIN,
    },
  });

  const classroom = await prisma.classroom.create({
    data: {
      name: "高二（3）班",
      grade: "高二",
      academicYear: "2026-2027",
      semester: Semester.FIRST,
      room: "致远楼 302",
      seatRows: DEFAULT_SEATING_ROWS,
      seatColumns: DEFAULT_SEATING_COLUMNS,
      memberships: {
        create: [
          {
            userId: teacher.id,
            role: MembershipRole.OWNER,
            isDefault: true,
          },
          {
            userId: admin.id,
            role: MembershipRole.OWNER,
            isDefault: true,
          },
        ],
      },
    },
  });

  const students = await Promise.all(
    studentNames.map((name, index) =>
      prisma.student.create({
        data: {
          classId: classroom.id,
          studentNo: `2026${String(index + 1).padStart(3, "0")}`,
          name,
          gender: index % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          birthDate: new Date(
            Date.UTC(2009, (index * 3) % 12, ((index * 5) % 25) + 1),
          ),
          dormitory: index % 3 === 0 ? `${3 + (index % 4)}-${201 + index}` : null,
          address: `晴川市青禾区示范路 ${100 + index} 号`,
          guardians: {
            create: {
              name: `${name.slice(0, 1)}先生`,
              relationship: index % 2 === 0 ? "父亲" : "母亲",
              phone: `1380000${String(index).padStart(4, "0")}`,
              wechat: `family_${String(index + 1).padStart(2, "0")}`,
              workplace: index % 3 === 0 ? "晴川市公共服务中心" : "青禾科技园",
              isPrimary: true,
            },
          },
        },
      }),
    ),
  );

  await prisma.seatAssignment.createMany({
    data: students.map((student, index) => ({
      classId: classroom.id,
      studentId: student.id,
      row: Math.floor(index / assignableSeatColumns.length) + 1,
      column: assignableSeatColumns[index % assignableSeatColumns.length],
    })),
  });

  for (let weekday = 1; weekday <= 5; weekday += 1) {
    await prisma.dutyGroup.create({
      data: {
        classId: classroom.id,
        name: `第${["一", "二", "三", "四", "五"][weekday - 1]}组`,
        weekday,
        area: weekday % 2 === 0 ? "教室、走廊" : "教室、卫生区",
        notes: weekday === 5 ? "放学前完成周末大扫除" : "早读前完成",
        sortOrder: weekday,
        assignments: {
          create: students
            .slice((weekday - 1) * 4, (weekday - 1) * 4 + 5)
            .map((student) => ({ studentId: student.id })),
        },
      },
    });
  }

  await prisma.committeeMember.createMany({
    data: [
      [0, "班长", "统筹班级事务，主持班会"],
      [1, "副班长", "协助班长，负责考勤"],
      [3, "学习委员", "收集学习反馈，联系课代表"],
      [5, "纪律委员", "维护自习与课间纪律"],
      [8, "劳动委员", "安排并检查值日工作"],
      [10, "体育委员", "组织两操与体育活动"],
    ].map(([studentIndex, title, responsibilities], sortOrder) => ({
      classId: classroom.id,
      studentId: students[Number(studentIndex)].id,
      title: String(title),
      responsibilities: String(responsibilities),
      sortOrder,
    })),
  });

  const courses = await Promise.all(
    courseDefinitions.map(([name, color]) =>
      prisma.course.create({ data: { name, color } }),
    ),
  );
  const courseMap = new Map(courses.map((course) => [course.name, course]));
  const weeklyCourseNames = [
    ["语文", "数学", "英语", "物理", "化学", "体育", "班会"],
    ["数学", "语文", "生物", "英语", "物理", "历史", "化学"],
    ["英语", "数学", "语文", "化学", "生物", "体育", "物理"],
    ["语文", "英语", "数学", "历史", "物理", "化学", "生物"],
    ["数学", "语文", "英语", "生物", "化学", "体育", "班会"],
  ];
  const teacherByCourse: Record<string, string> = {
    语文: "王老师",
    数学: "李老师",
    英语: "赵老师",
    物理: "陈老师",
    化学: "何老师",
    生物: "孙老师",
    历史: "吴老师",
    体育: "冯老师",
    班会: "周老师",
  };

  await prisma.timetableEntry.createMany({
    data: weeklyCourseNames.flatMap((day, dayIndex) =>
      day.map((courseName, periodIndex) => ({
        classId: classroom.id,
        courseId: courseMap.get(courseName)!.id,
        weekday: dayIndex + 1,
        period: periodIndex + 1,
        teacherName: teacherByCourse[courseName],
        room: courseName === "体育" ? "田径场" : classroom.room,
      })),
    ),
  });

  const subjects = await Promise.all(
    ["语文", "数学", "英语", "物理", "化学", "生物"].map((name, sortOrder) =>
      prisma.subject.create({ data: { name, sortOrder } }),
    ),
  );
  const exam = await prisma.exam.create({
    data: {
      classId: classroom.id,
      name: "第一学期期中考试",
      examDate: new Date("2026-11-12T00:00:00.000Z"),
      status: ExamStatus.PUBLISHED,
      subjects: {
        create: subjects.map((subject) => ({
          subjectId: subject.id,
          maxScore: 100,
          passScore: 60,
        })),
      },
    },
    include: { subjects: true },
  });

  await prisma.exam.create({
    data: {
      classId: classroom.id,
      name: "九月学情检测",
      examDate: new Date("2026-09-24T00:00:00.000Z"),
      status: ExamStatus.PUBLISHED,
      subjects: {
        create: subjects.map((subject) => ({
          subjectId: subject.id,
          maxScore: 100,
          passScore: 60,
        })),
      },
    },
  });

  await prisma.score.createMany({
    data: exam.subjects.flatMap((examSubject, subjectIndex) =>
      students.map((student, studentIndex) => {
        const absent = studentIndex === 17 && subjectIndex === 3;
        return {
          examSubjectId: examSubject.id,
          studentId: student.id,
          score: absent ? null : 68 + ((studentIndex * 7 + subjectIndex * 5) % 31),
          absent,
        };
      }),
    ),
  });

  await prisma.workItem.createMany({
    data: [
      {
        classId: classroom.id,
        title: "收齐社会实践活动回执",
        dueAt: new Date("2026-09-02T09:00:00.000Z"),
        priority: "HIGH",
      },
      {
        classId: classroom.id,
        title: "确认本周主题班会素材",
        dueAt: new Date("2026-09-04T07:00:00.000Z"),
        priority: "MEDIUM",
      },
      {
        classId: classroom.id,
        title: "与月考波动学生谈话",
        dueAt: new Date("2026-09-05T10:00:00.000Z"),
        priority: "MEDIUM",
      },
    ],
  });
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    console.info("Seed completed. Login with admin / admin123");
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
