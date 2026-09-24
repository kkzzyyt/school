import dayjs from "dayjs";

export type DayPeriod = "DAWN" | "MORNING" | "FORENOON" | "NOON" | "AFTERNOON" | "EVENING" | "NIGHT";

export interface TimeGreeting {
  /** 随时间动态变化的问候语：早上好、上午好、中午好、下午好、晚上好、夜深了 */
  greeting: string;
  /** 随时间动态变化的班主任贴心提醒/推送寄语 */
  prompt: string;
  /** 时段枚举 */
  period: DayPeriod;
}

/**
 * 根据时间（默认当前本地时间）计算问候语与推送寄语
 *
 * 时段划分：
 * - 05:00 ~ 08:59: 早上好 · 晨光熹微，开启充实有序的新一天
 * - 09:00 ~ 11:59: 上午好 · 专注教学，把握黄金课堂时光
 * - 12:00 ~ 13:59: 中午好 · 午间小憩，适度放松补充精力
 * - 14:00 ~ 17:59: 下午好 · 劳逸结合，关注午后课堂学生状态
 * - 18:00 ~ 22:59: 晚上好 · 辛苦了，晚自习巡视与备课顺利
 * - 23:00 ~ 04:59: 夜深了 · 披星戴月，早点休息保重身体
 */
export function getTimeGreeting(now: dayjs.Dayjs | Date = new Date()): TimeGreeting {
  const d = dayjs(now);
  const hour = d.hour();

  if (hour >= 5 && hour < 9) {
    return {
      greeting: "早上好",
      prompt: "晨光熹微，开启充实有序的新一天",
      period: "MORNING",
    };
  }
  if (hour >= 9 && hour < 12) {
    return {
      greeting: "上午好",
      prompt: "专注教学，把握黄金课堂时光",
      period: "FORENOON",
    };
  }
  if (hour >= 12 && hour < 14) {
    return {
      greeting: "中午好",
      prompt: "午间小憩，适度放松补充精力",
      period: "NOON",
    };
  }
  if (hour >= 14 && hour < 18) {
    return {
      greeting: "下午好",
      prompt: "劳逸结合，关注午后课堂学生状态",
      period: "AFTERNOON",
    };
  }
  if (hour >= 18 && hour < 23) {
    return {
      greeting: "晚上好",
      prompt: "辛苦了，晚自习巡视与备课顺利",
      period: "EVENING",
    };
  }
  return {
    greeting: "夜深了",
    prompt: "披星戴月，早点休息保重身体",
    period: "NIGHT",
  };
}
