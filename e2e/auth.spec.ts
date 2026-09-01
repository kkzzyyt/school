import { expect, test } from "@playwright/test";

test("班主任可以登录、进入工作台并退出", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "智教办公系统" })).toBeVisible();
  await page.getByLabel("教工号/账号").fill("teacher");
  await page.getByLabel("密码").fill("Teacher@123");
  await page.getByRole("button", { name: "立即登录" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /早上好，周老师/ })).toBeVisible();
  await page.getByRole("button", { name: /周老师/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "智教办公系统" })).toBeVisible();
});

test("花名册支持搜索学生", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("教工号/账号").fill("teacher");
  await page.getByLabel("密码").fill("Teacher@123");
  await page.getByRole("button", { name: "立即登录" }).click();
  await page.getByRole("menuitem", { name: "花名册" }).click();

  await page.getByPlaceholder("搜索姓名或学号").fill("陈晨");
  await expect(page.getByText("陈晨", { exact: true })).toBeVisible();
  await expect(page.getByText("林溪", { exact: true })).not.toBeVisible();
});
