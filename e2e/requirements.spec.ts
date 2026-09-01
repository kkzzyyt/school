import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByRole("textbox", { name: "账号" }).fill("teacher");
  await page.getByLabel("密码").fill("Teacher@123");
  await page.getByRole("button", { name: "立即登录" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("移动端花名册支持搜索并打开响应式编辑表单", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/students");

  await expect(page.getByRole("heading", { name: "学生花名册" })).toBeVisible();
  await page.getByPlaceholder("搜索姓名或学号").fill("陈晨");
  await page.getByPlaceholder("搜索姓名或学号").press("Enter");
  await expect(page.getByText("陈晨", { exact: true })).toBeVisible();
  await expect(page.getByText("林溪", { exact: true })).not.toBeVisible();

  await page.getByRole("button", { name: "新增学生" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("学号")).toBeVisible();
  await expect(dialog.getByLabel("姓名")).toBeVisible();
  await expect(dialog.getByLabel("学生电话")).toBeVisible();
  await dialog.getByRole("button", { name: /取\s*消/ }).click();
});

test("移动端课程表可以打开某个时段的编辑交互", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/timetable");

  await page.locator('[role="tablist"][aria-label="选择工作日"] [role="tab"]').first().click();
  const firstPeriod = page.getByRole("button", { name: /周一第 1 节/ }).first();
  await expect(firstPeriod).toBeVisible();
  await firstPeriod.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "课程" })).toBeVisible();
  await expect(dialog.getByRole("combobox", { name: "任课教师" })).toBeVisible();
  await dialog.getByRole("button", { name: /取\s*消/ }).click();

  const overflow = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
  }));
  expect(overflow.documentWidth).toBeLessThanOrEqual(overflow.viewportWidth + 1);
});

test("拖拽课程后保存请求保留新的课程位置", async ({ page }) => {
  await login(page);
  await page.goto("/timetable");

  await page.route("**/api/timetable", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { count: 1 } }),
    });
  });

  const source = page.getByRole("button", { name: /周一第 1 节/ }).first();
  const target = page.locator('[role="gridcell"][data-position="1:9"]');
  await expect(source).toBeVisible();
  await expect(target).toBeVisible();
  await source.dragTo(target);
  await expect(page.getByText("有未保存修改", { exact: true })).toBeVisible();

  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().endsWith("/api/timetable") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "保存课表" }).click();
  const saveRequest = await saveRequestPromise;
  const payload = JSON.parse(saveRequest.postData() ?? "{}") as {
    entries?: Array<{ weekday: number; period: number; teacherName: string | null }>;
  };

  expect(payload.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ weekday: 1, period: 9 }),
  ]));
});

test("座次调整显示脏状态并保存完整环境载荷", async ({ page }) => {
  await login(page);

  await page.route("**/api/seating", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: {} }),
    });
  });
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();

  await page.getByText("全部学生", { exact: true }).click();
  const selectedStudent = page.locator(".student-pool-item").first();
  const emptySeat = page.locator(".seat-empty-trigger").first();
  await expect(selectedStudent).toBeVisible();
  await expect(emptySeat).toBeVisible();
  await selectedStudent.click();
  await emptySeat.click();

  await expect(page.getByText("有未保存修改", { exact: true })).toBeVisible();
  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().endsWith("/api/seating") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "保存座次" }).click();
  const saveRequest = await saveRequestPromise;
  const payload = JSON.parse(saveRequest.postData() ?? "{}") as {
    assignments?: Array<{ studentId: string; row: number; column: number }>;
    environment?: unknown;
  };

  expect(payload.environment).toBeDefined();
  expect(payload.assignments).toBeDefined();
  const positions = payload.assignments!.map(({ row, column }) => `${row}:${column}`);
  expect(new Set(positions).size).toBe(positions.length);
});

test.fixme("学生批量导入在后端契约落地后应验证校验、原子回滚和 Idempotency-Key 重放", async ({ request }) => {
  const response = await request.post("/api/students/import", {
    headers: { "Idempotency-Key": "e2e-import-key" },
    data: { rows: [] },
  });
  expect(response.status()).toBe(200);
});

test("教师目录支持新增教师并保存目录变更", async ({ page }) => {
  await login(page);
  await page.goto("/teachers");

  await page.route("**/api/teachers", async (route) => {
    if (route.request().method() !== "PUT") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data: { teachers: [] } }),
    });
  });

  await page.getByRole("button", { name: "新增教师" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("教师姓名").fill("测试教师");
  await dialog.getByLabel("职务或任教方向").fill("班主任");
  await dialog.getByRole("button", { name: "保存资料" }).click();

  await expect(page.getByRole("heading", { name: "测试教师" })).toBeVisible();
  await expect(page.getByText("有未保存修改", { exact: true })).toBeVisible();
  const saveRequestPromise = page.waitForRequest(
    (request) => request.url().endsWith("/api/teachers") && request.method() === "PUT",
  );
  await page.getByRole("button", { name: "保存目录" }).click();
  const saveRequest = await saveRequestPromise;
  const payload = JSON.parse(saveRequest.postData() ?? "{}") as {
    items?: Array<{ name: string; title: string; status: string }>;
  };

  expect(payload.items).toEqual(expect.arrayContaining([
    expect.objectContaining({ name: "测试教师", title: "班主任", status: "active" }),
  ]));
});
