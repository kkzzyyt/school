import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByLabel("教工号/账号").fill("teacher");
  await page.getByLabel("密码").fill("Teacher@123");
  await page.getByRole("button", { name: "立即登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("桌面工作区呈现设计稿中的全局导航骨架", async ({ page }) => {
  await login(page);

  await expect(page.getByText("智教办公系统", { exact: true }).first()).toBeVisible();
  await expect(page.getByPlaceholder("搜索学生、班级...")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "成绩分析" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /早上好，周老师/ })).toBeVisible();
});

test("移动端可以打开工作区导航", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);

  await page.getByRole("button", { name: "打开导航菜单" }).click();
  await expect(page.getByRole("menuitem", { name: "成绩分析" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "家长通讯录" })).toBeVisible();
});
