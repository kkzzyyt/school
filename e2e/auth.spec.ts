import { expect, test } from "@playwright/test";

test("用户名或密码错误时保留登录页并显示错误", async ({ page }) => {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        success: false,
        error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
      }),
    });
  });
  await page.goto("/login");

  const documentRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "document") documentRequests.push(request.url());
  });

  await page.locator('input[autocomplete="username"]').fill("mx");
  await page.getByLabel("密码").fill("wrong");
  await page.getByRole("button", { name: "立即登录" }).click();

  await expect(page.getByRole("region", { name: "智教办公系统" }).getByRole("alert")).toContainText("用户名或密码错误");
  await expect(page).toHaveURL(/\/login$/);
  expect(documentRequests).toEqual([]);
});

test("班主任可以登录、进入工作台并退出", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "智教办公系统" })).toBeVisible();
  await page.getByRole("textbox", { name: "账号" }).fill("mx");
  await page.getByLabel("密码").fill("123456");
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
  await page.getByRole("textbox", { name: "账号" }).fill("mx");
  await page.getByLabel("密码").fill("123456");
  await page.getByRole("button", { name: "立即登录" }).click();
  await page.getByRole("menuitem", { name: "花名册" }).click();

  await page.getByPlaceholder("搜索姓名或学号").fill("陈晨");
  await page.getByPlaceholder("搜索姓名或学号").press("Enter");
  await expect(page.getByText("陈晨", { exact: true })).toBeVisible();
  await expect(page.getByText("林溪", { exact: true })).not.toBeVisible();
});
