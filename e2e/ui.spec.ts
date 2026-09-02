import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "账号" }).fill("teacher");
  await page.getByLabel("密码").fill("Teacher@123");
  await page.getByRole("button", { name: "立即登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("桌面工作区呈现设计稿中的全局导航骨架", async ({ page }) => {
  await login(page);

  await expect(page.getByText("智教办公系统", { exact: true }).first()).toBeVisible();
  await expect(page.getByPlaceholder("搜索学生、班级...")).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "工作台" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "座次表" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "花名册" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "家长通讯录" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /早上好，周老师/ })).toBeVisible();
});

test("未启用的功能在工作区入口中隐藏", async ({ page }) => {
  await login(page);

  for (const label of ["课程表", "值日表", "班委名单", "成绩分析"]) {
    await expect(page.getByRole("menuitem", { name: label })).toHaveCount(0);
  }
  await expect(page.getByRole("menuitem", { name: "课程表" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /完整课表/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "调整安排" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "查看分析" })).toHaveCount(0);
  await expect(page.getByText("今日课程", { exact: true })).toBeVisible();
});

test("移动端可以打开工作区导航", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await page.getByRole("button", { name: "打开导航菜单" }).click();
  await expect(page.getByRole("menuitem", { name: "成绩分析" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "值日表" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "班委名单" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "课程表" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "家长通讯录" })).toBeVisible();
});

test("工作区页面保留统一区块间距并使用简洁顶部操作区", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);

  const pageStack = page.locator(".workspace-page-stack");
  await expect(pageStack).toBeVisible();

  const pageGap = await pageStack.evaluate((element) => Number.parseFloat(getComputedStyle(element).rowGap));
  expect(pageGap).toBeGreaterThanOrEqual(24);

  await expect(page.locator(".global-search")).toHaveCount(0);
  await expect(page.locator(".header-actions")).toBeVisible();
});
