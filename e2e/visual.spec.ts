import { expect, test } from "@playwright/test";

const pages = [
  { name: "dashboard", path: "/dashboard", heading: /早上好，周老师/ },
  { name: "seating", path: "/seating", heading: "班级座次表" },
  { name: "duties", path: "/duties", heading: "班级值日安排" },
  { name: "grades", path: "/grades", heading: /成绩分析/ },
  { name: "students", path: "/students", heading: "学生花名册" },
  { name: "committee", path: "/committee", heading: "班级组织架构" },
  { name: "contacts", path: "/contacts", heading: "家长联系名录" },
  { name: "timetable", path: "/timetable", heading: "班级课程安排" },
] as const;

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("教工号/账号").fill("teacher");
  await page.getByLabel("密码").fill("Teacher@123");
  await page.getByRole("button", { name: "立即登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

async function expectNoPageOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    pageWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.pageWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

async function waitForPageData(page: import("@playwright/test").Page) {
  await expect(page.locator(".ant-skeleton, .ant-spin-spinning")).toHaveCount(0, { timeout: 10_000 });
}

test("全部工作区页面在桌面视口保持完整布局", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);

  for (const item of pages) {
    await page.goto(item.path);
    await expect(page.getByRole("heading", { level: 1, name: item.heading })).toBeVisible();
    if (item.path === "/grades") {
      await expect(page.getByRole("button", { name: "录入成绩" })).toBeEnabled({ timeout: 10_000 });
      await expect(page.locator(".recharts-bar-rectangle").first()).toBeVisible({ timeout: 10_000 });
    }
    await waitForPageData(page);
    await expectNoPageOverflow(page);
    await page.screenshot({ path: testInfo.outputPath(`${item.name}-desktop.png`), fullPage: false });
  }
  expect(runtimeErrors).toEqual([]);
});

test("全部工作区页面在移动视口不产生整页横向溢出", async ({ page }, testInfo) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  for (const item of pages) {
    await page.goto(item.path);
    await expect(page.getByRole("heading", { level: 1, name: item.heading })).toBeVisible();
    await waitForPageData(page);
    await expectNoPageOverflow(page);
  }

  await page.goto("/contacts");
  await expect(page.getByRole("heading", { level: 1, name: "家长联系名录" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("contacts-mobile.png"), fullPage: false });
  expect(runtimeErrors).toEqual([]);
});
