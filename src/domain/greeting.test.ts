import dayjs from "dayjs";
import { describe, expect, it } from "vitest";

import { getTimeGreeting } from "./greeting";

describe("getTimeGreeting", () => {
  it("returns 早上好 in early morning (05:00 - 08:59)", () => {
    const t5 = dayjs().hour(5).minute(0);
    const t8 = dayjs().hour(8).minute(59);

    expect(getTimeGreeting(t5).greeting).toBe("早上好");
    expect(getTimeGreeting(t5).period).toBe("MORNING");
    expect(getTimeGreeting(t8).greeting).toBe("早上好");
  });

  it("returns 上午好 in forenoon (09:00 - 11:59)", () => {
    const t9 = dayjs().hour(9).minute(0);
    const t11 = dayjs().hour(11).minute(59);

    expect(getTimeGreeting(t9).greeting).toBe("上午好");
    expect(getTimeGreeting(t9).period).toBe("FORENOON");
    expect(getTimeGreeting(t11).greeting).toBe("上午好");
  });

  it("returns 中午好 at noon (12:00 - 13:59)", () => {
    const t12 = dayjs().hour(12).minute(0);
    const t13 = dayjs().hour(13).minute(59);

    expect(getTimeGreeting(t12).greeting).toBe("中午好");
    expect(getTimeGreeting(t12).period).toBe("NOON");
    expect(getTimeGreeting(t13).greeting).toBe("中午好");
  });

  it("returns 下午好 in afternoon (14:00 - 17:59)", () => {
    const t14 = dayjs().hour(14).minute(0);
    const t17 = dayjs().hour(17).minute(59);

    expect(getTimeGreeting(t14).greeting).toBe("下午好");
    expect(getTimeGreeting(t14).period).toBe("AFTERNOON");
    expect(getTimeGreeting(t17).greeting).toBe("下午好");
  });

  it("returns 晚上好 in evening (18:00 - 22:59)", () => {
    const t18 = dayjs().hour(18).minute(0);
    const t22 = dayjs().hour(22).minute(59);

    expect(getTimeGreeting(t18).greeting).toBe("晚上好");
    expect(getTimeGreeting(t18).period).toBe("EVENING");
    expect(getTimeGreeting(t22).greeting).toBe("晚上好");
  });

  it("returns 夜深了 late night (23:00 - 04:59)", () => {
    const t23 = dayjs().hour(23).minute(0);
    const t0 = dayjs().hour(0).minute(30);
    const t4 = dayjs().hour(4).minute(59);

    expect(getTimeGreeting(t23).greeting).toBe("夜深了");
    expect(getTimeGreeting(t23).period).toBe("NIGHT");
    expect(getTimeGreeting(t0).greeting).toBe("夜深了");
    expect(getTimeGreeting(t4).greeting).toBe("夜深了");
  });
});
