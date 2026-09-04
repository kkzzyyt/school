import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "账号" }).fill(username);
  await page.getByRole("textbox", { name: "密码", exact: true }).fill(password);
  await page.getByRole("button", { name: "立即登录" }).click();
  await page.waitForURL(/\/(dashboard|admin\/users)$/, { timeout: 10_000 });
}

test("注册申请经管理员审核并分配班级后可以登录", async ({ page }) => {
  const username = `e2e_teacher_${Date.now()}`;
  const password = "Teacher123";

  await page.goto("/register");
  await page.getByRole("textbox", { name: "账号" }).fill(username);
  await page.getByRole("textbox", { name: "姓名" }).fill("浏览器测试老师");
  await page.getByRole("textbox", { name: "密码", exact: true }).fill(password);
  await page.getByLabel("确认密码").fill(password);
  await page.getByRole("button", { name: /提交注册申请/ }).click();
  await expect(page.getByRole("status")).toContainText("申请已提交");

  await login(page, "admin", "123456");
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "工作台" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "班级管理" })).toBeVisible();
  await page.getByPlaceholder("搜索账号或姓名").fill(username);
  await page.getByPlaceholder("搜索账号或姓名").press("Enter");
  await expect(page.getByText(username, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "审核" }).click();

  const classSelect = page.getByRole("combobox", { name: "默认班级" });
  await classSelect.click();
  await classSelect.press("ArrowDown");
  await classSelect.press("Enter");
  await page.getByRole("button", { name: "批准并开通" }).click();
  await expect(page.getByText("已启用", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: /系统管理员/ }).click();
  await page.getByRole("menuitem", { name: "退出登录" }).click();
  await login(page, username, password);
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("班主任不能访问用户管理页面", async ({ page }) => {
  await login(page, "mx", "123456");
  await page.goto("/admin/users");
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /早上好/ })).toBeVisible();
});

test("管理员可以在班级管理查看学生基础信息", async ({ page }) => {
  await login(page, "admin", "123456");
  await page.goto("/admin/classes");

  await expect(page.getByRole("heading", { name: "班级管理" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "工作台" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "用户管理" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "班级管理" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "学号" }).first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "姓名" }).first()).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "学籍状态" }).first()).toBeVisible();
  await expect(page.getByText("手机号", { exact: true })).toHaveCount(0);
});
