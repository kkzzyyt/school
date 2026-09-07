import "dotenv/config";

import { Gender } from "../src/generated/prisma/client";
import { prisma } from "../src/server/db/prisma";

export const REAL_STUDENT_ROSTER: Array<{
  studentNo: string;
  name: string;
  gender: Gender;
}> = [
  { studentNo: "202608001", name: "孙溪桥", gender: "MALE" },
  { studentNo: "202608002", name: "李玉宸", gender: "MALE" },
  { studentNo: "202608003", name: "李念孜", gender: "FEMALE" },
  { studentNo: "202608004", name: "张瀞涵", gender: "FEMALE" },
  { studentNo: "202608005", name: "高韵涵", gender: "FEMALE" },
  { studentNo: "202608006", name: "姚念孜", gender: "FEMALE" },
  { studentNo: "202608007", name: "刘浩文", gender: "MALE" },
  { studentNo: "202608008", name: "王祺正", gender: "MALE" },
  { studentNo: "202608009", name: "甄嫒瑄", gender: "FEMALE" },
  { studentNo: "202608010", name: "马菁柔", gender: "FEMALE" },
  { studentNo: "202608011", name: "王靖凯", gender: "MALE" },
  { studentNo: "202608012", name: "王则茗", gender: "MALE" },
  { studentNo: "202608013", name: "许洺祎", gender: "MALE" },
  { studentNo: "202608014", name: "李东昱", gender: "MALE" },
  { studentNo: "202608015", name: "胡诗淇", gender: "FEMALE" },
  { studentNo: "202608016", name: "韩蕙熙", gender: "FEMALE" },
  { studentNo: "202608017", name: "武文一", gender: "MALE" },
  { studentNo: "202608018", name: "王寅", gender: "MALE" },
  { studentNo: "202608019", name: "南云松", gender: "MALE" },
  { studentNo: "202608020", name: "白易韬", gender: "MALE" },
  { studentNo: "202608021", name: "王浩焱", gender: "MALE" },
  { studentNo: "202608022", name: "孟令浩", gender: "MALE" },
  { studentNo: "202608023", name: "安柏霖", gender: "MALE" },
  { studentNo: "202608024", name: "张懿轩", gender: "MALE" },
  { studentNo: "202608025", name: "国月涵", gender: "FEMALE" },
  { studentNo: "202608026", name: "赖可洁", gender: "FEMALE" },
  { studentNo: "202608027", name: "仇渲钥", gender: "FEMALE" },
  { studentNo: "202608028", name: "沈泽熙", gender: "FEMALE" },
  { studentNo: "202608029", name: "张翊涵", gender: "FEMALE" },
  { studentNo: "202608030", name: "张俪欣茹", gender: "FEMALE" },
  { studentNo: "202608031", name: "翟之菡", gender: "FEMALE" },
  { studentNo: "202608032", name: "张凌云", gender: "FEMALE" },
  { studentNo: "202608033", name: "汪玥彤", gender: "FEMALE" },
  { studentNo: "202608034", name: "张子涵", gender: "FEMALE" },
  { studentNo: "202608035", name: "苗秦悦", gender: "MALE" },
  { studentNo: "202608036", name: "曹宸恺", gender: "MALE" },
  { studentNo: "202608037", name: "宁福祥", gender: "MALE" },
  { studentNo: "202608038", name: "胡煜轩", gender: "MALE" },
  { studentNo: "202608039", name: "王昕禹", gender: "MALE" },
  { studentNo: "202608040", name: "龚婉晨", gender: "FEMALE" },
  { studentNo: "202608041", name: "潘小菲", gender: "FEMALE" },
  { studentNo: "202608042", name: "赵雅涵", gender: "FEMALE" },
  { studentNo: "202608043", name: "边奥斐", gender: "FEMALE" },
  { studentNo: "202608044", name: "张烨莹", gender: "FEMALE" },
  { studentNo: "202608045", name: "韩昊蒴", gender: "MALE" },
  { studentNo: "202608046", name: "李佳航", gender: "MALE" },
  { studentNo: "202608047", name: "张琳俊妍", gender: "FEMALE" },
  { studentNo: "202608048", name: "杨荻坤", gender: "FEMALE" },
  { studentNo: "202608049", name: "蒋志豪", gender: "MALE" },
  { studentNo: "202608050", name: "陈峙昕", gender: "MALE" },
  { studentNo: "202608051", name: "蔡明泽", gender: "MALE" },
  { studentNo: "202608052", name: "董昊阳", gender: "MALE" },
  { studentNo: "202608053", name: "杨睿烁", gender: "MALE" },
  { studentNo: "202608054", name: "李枫鸣", gender: "MALE" },
];

async function syncRealStudents() {
  const existingStudents = await prisma.student.findMany({
    select: { id: true, studentNo: true, name: true, gender: true },
    orderBy: { studentNo: "asc" },
  });

  const existingMap = new Map(existingStudents.map((s) => [s.studentNo, s]));
  const nameChanges: Array<{ studentNo: string; from: string; to: string }> = [];
  const genderChanges: Array<{
    studentNo: string;
    name: string;
    from: Gender;
    to: Gender;
  }> = [];

  let updatedCount = 0;

  for (const item of REAL_STUDENT_ROSTER) {
    const existing = existingMap.get(item.studentNo);
    if (!existing) {
      console.warn(`[WARN] Student ${item.studentNo} (${item.name}) not found in DB!`);
      continue;
    }

    const needsNameUpdate = existing.name !== item.name;
    const needsGenderUpdate = existing.gender !== item.gender;

    if (needsNameUpdate) {
      nameChanges.push({
        studentNo: item.studentNo,
        from: existing.name,
        to: item.name,
      });
    }

    if (needsGenderUpdate) {
      genderChanges.push({
        studentNo: item.studentNo,
        name: item.name,
        from: existing.gender,
        to: item.gender,
      });
    }

    if (needsNameUpdate || needsGenderUpdate) {
      await prisma.student.update({
        where: { id: existing.id },
        data: {
          name: item.name,
          gender: item.gender,
        },
      });
      updatedCount++;
    }
  }

  console.info(
    JSON.stringify(
      {
        totalTarget: REAL_STUDENT_ROSTER.length,
        totalExisting: existingStudents.length,
        updatedCount,
        nameChanges,
        genderChanges,
      },
      null,
      2,
    ),
  );
}

syncRealStudents()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
