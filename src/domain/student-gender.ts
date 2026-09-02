export type StudentGenderValue = "MALE" | "FEMALE" | "OTHER";
export type InferredStudentGender = Exclude<StudentGenderValue, "OTHER">;

// These are deliberately conservative name hints. They are presentation aids for
// records whose stored gender is OTHER, not a replacement for the student's data.
const femaleNameHints = new Set(
  Array.from("婷娜芳静丽娟英霞敏燕倩欣怡妍琳慧婉晴芸菲蕾佳涵洁彤悦菡莹柔瑄嫒菁诗蕙淇茹俪熙玥雅芷婧瑶璇珊雯薇娇露梅兰玲秀娥娅媛馨妤婕萱"),
);
const maleNameHints = new Set(
  Array.from("伟强军磊涛杰勇刚鹏超宇轩浩凯峰东波龙博昊阳晨宸哲豪泽航坤祥恺昱寅松鸣文毅华明亮斌栋辉俊锋洋鑫铭远辰立正福禹成旭昆"),
);

function scoreNameHints(name: string, hints: Set<string>) {
  return Array.from(name).slice(1).reduce(
    (score, character) => score + (hints.has(character) ? 1 : 0),
    0,
  );
}

export function inferStudentGenderFromName(name: string): InferredStudentGender | null {
  const normalizedName = name.trim();
  if (!normalizedName) return null;

  const nameCharacters = Array.from(normalizedName);
  const givenName = nameCharacters.length > 1 ? normalizedName : "";
  if (!givenName) return null;

  const femaleScore = scoreNameHints(givenName, femaleNameHints);
  const maleScore = scoreNameHints(givenName, maleNameHints);

  // A tie is intentionally left unresolved instead of letting the set order
  // turn an ambiguous name into a definitive-looking label.
  if (femaleScore === maleScore) {
    return null;
  }

  return femaleScore > maleScore ? "FEMALE" : "MALE";
}

export interface StudentGenderResolution {
  value: StudentGenderValue;
  label: "男" | "女" | "其他";
  inferred: boolean;
}

export function resolveStudentGender(
  gender: StudentGenderValue | null | undefined,
  name: string,
): StudentGenderResolution {
  if (gender === "MALE") return { value: "MALE", label: "男", inferred: false };
  if (gender === "FEMALE") return { value: "FEMALE", label: "女", inferred: false };

  const inferredGender = inferStudentGenderFromName(name);
  if (inferredGender === "MALE") return { value: "MALE", label: "男", inferred: true };
  if (inferredGender === "FEMALE") return { value: "FEMALE", label: "女", inferred: true };
  return { value: "OTHER", label: "其他", inferred: false };
}
