import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "账号" }).fill("teacher");
  await page.getByLabel("密码").fill("Teacher@123");
  await page.getByRole("button", { name: "立即登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("花名册内的全局搜索会同步页面筛选条件", async ({ page }) => {
  await login(page);
  await page.goto("/students");

  await page.getByPlaceholder("搜索学生、班级...").fill("陈晨");
  await page.getByPlaceholder("搜索学生、班级...").press("Enter");

  await expect(page.getByPlaceholder("搜索姓名或学号")).toHaveValue("陈晨");
  await expect(page.getByText("陈晨", { exact: true })).toBeVisible();
  await expect(page.getByText("林溪", { exact: true })).not.toBeVisible();
});

test("课程与联系人弹窗取消后不会把旧值带到新记录", async ({ page }) => {
  await login(page);
  await page.goto("/timetable");
  await page.getByRole("button", { name: /周一第 1 节/ }).click();
  await page.getByRole("button", { name: /取\s*消/ }).click();
  await page.getByRole("button", { name: /周一第 8 节/ }).click();
  await expect(page.getByRole("combobox", { name: "课程" })).toHaveValue("");
  await page.getByRole("button", { name: /取\s*消/ }).click();

  await page.goto("/contacts");
  await page.getByRole("button", { name: /编辑陈先生/ }).click();
  await page.getByRole("button", { name: /取\s*消/ }).click();
  await page.getByRole("button", { name: "新增联系人" }).click();
  await expect(page.getByLabel("家长姓名")).toHaveValue("");
  await expect(page.getByLabel("手机号")).toHaveValue("");
});

test("课程编辑弹窗正确区分清空与编辑操作", async ({ page }) => {
  await login(page);
  await page.goto("/timetable");

  await page.getByRole("button", { name: /周一第 1 节/ }).click();
  const modalFooter = page.locator(".timetable-modal-footer");
  await expect(modalFooter).toBeVisible();
  await expect(page.getByRole("button", { name: "清空节次" })).toBeVisible();
  await expect(modalFooter).toHaveCSS("display", "flex");

  await page.getByRole("button", { name: "清空节次" }).click();
  await expect(page.getByRole("button", { name: "周一第 1 节，未安排课程" })).toBeVisible();

  await page.getByRole("button", { name: /周一第 8 节/ }).click();
  await expect(page.getByRole("button", { name: "清空节次" })).toHaveCount(0);
});

test("座位和课程格具有唯一可访问名称", async ({ page }) => {
  await login(page);
  await page.goto("/seating");
  await expect(page.getByRole("combobox", { name: "1排1座学生" })).toBeVisible();
  await expect(page.locator(".seat-aisle")).toHaveCount(14);
  await expect(page.getByRole("combobox", { name: "1排3座学生" })).toHaveCount(0);

  await page.goto("/timetable");
  await expect(page.getByRole("button", { name: /周一第 1 节/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /周五第 8 节/ })).toBeVisible();
});

test("退出请求失败时保留当前会话并给出反馈", async ({ page }) => {
  await login(page);
  await page.route("**/api/auth/logout", async (route) => {
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });

  await page.getByRole("button", { name: "退出登录" }).click();

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText("退出失败，请稍后重试")).toBeVisible();
});
