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
  const drawerBody = dialog.locator(".ant-drawer-body");
  const drawerFooter = dialog.locator(".ant-drawer-footer");
  await expect(drawerBody).toBeVisible();
  await expect(drawerFooter).toBeVisible();
  const drawerLayout = await page.evaluate(() => {
    const body = document.querySelector(".ant-drawer-open .ant-drawer-body");
    const footer = document.querySelector(".ant-drawer-open .ant-drawer-footer");
    const bodyRect = body?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyBottom: bodyRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
      footerBottom: footerRect?.bottom ?? 0,
      viewportHeight: window.innerHeight,
    };
  });
  expect(drawerLayout.documentWidth).toBeLessThanOrEqual(drawerLayout.viewportWidth + 1);
  expect(drawerLayout.footerTop).toBeGreaterThanOrEqual(drawerLayout.bodyBottom - 1);
  expect(drawerLayout.footerBottom).toBeLessThanOrEqual(drawerLayout.viewportHeight + 1);
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

test("花名册会标记根据姓名推断的性别", async ({ page }) => {
  await login(page);
  await page.route("**/api/students**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          items: [
            {
              id: "name-hint-male",
              studentNo: "T001",
              name: "蒋志豪",
              gender: "OTHER",
              birthDate: null,
              phone: null,
              address: null,
              dormitory: null,
              status: "ACTIVE",
              guardians: [],
            },
            {
              id: "name-hint-female",
              studentNo: "T002",
              name: "赵雅涵",
              gender: "OTHER",
              birthDate: null,
              phone: null,
              address: null,
              dormitory: null,
              status: "ACTIVE",
              guardians: [],
            },
            {
              id: "explicit-male",
              studentNo: "T003",
              name: "王伟",
              gender: "MALE",
              birthDate: null,
              phone: null,
              address: null,
              dormitory: null,
              status: "ACTIVE",
              guardians: [],
            },
          ],
          meta: { total: 3, page: 1, pageSize: 100 },
        },
      }),
    });
  });
  await page.goto("/students");

  const maleCard = page.getByRole("button", { name: "查看蒋志豪的学生档案" });
  const femaleCard = page.getByRole("button", { name: "查看赵雅涵的学生档案" });
  const explicitCard = page.getByRole("button", { name: "查看王伟的学生档案" });
  await expect(maleCard).toContainText("男");
  await expect(maleCard.getByText("姓名推断", { exact: true })).toBeVisible();
  await expect(femaleCard).toContainText("女");
  await expect(femaleCard.getByText("姓名推断", { exact: true })).toBeVisible();
  await expect(explicitCard).toContainText("男");
  await expect(explicitCard.getByText("姓名推断", { exact: true })).toHaveCount(0);

  await maleCard.click();
  await expect(page.getByRole("dialog")).toContainText("根据姓名推断");
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

  const pool = page.locator(".seating-sidebar-floating");
  await page.getByRole("button", { name: "打开学生池" }).click();
  const selectedStudent = pool.locator(".student-pool-item").first();
  const emptySeat = page.locator(".seat-empty-trigger").first();
  await expect(pool).toBeVisible();
  await expect(page.getByRole("button", { name: "打开编辑工具" })).toHaveCount(0);
  await expect(pool.getByRole("heading")).toHaveCount(0);
  await expect(pool.getByPlaceholder("搜索姓名或学号")).toHaveCount(0);
  await expect(pool.locator(".ant-segmented, .ant-tag, .student-avatar, .student-drag-icon")).toHaveCount(0);
  await expect(pool.locator(".seating-sidebar-floating-handle")).toHaveCount(1);
  await expect(selectedStudent).toBeVisible();
  await expect(selectedStudent).toContainText(/\S/);
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
    revision?: string;
    assignments?: Array<{ studentId: string; row: number; column: number }>;
    environment?: unknown;
  };

  expect(payload.revision).toBeTruthy();
  expect(payload.environment).toBeDefined();
  expect((payload.environment as { aisleAfterColumns?: number[] }).aisleAfterColumns).toBeDefined();
  expect(payload.assignments).toBeDefined();
  const positions = payload.assignments!.map(({ row, column }) => `${row}:${column}`);
  expect(new Set(positions).size).toBe(positions.length);
});

test("座次学生卡仅显示姓名且依据 gender 区分颜色", async ({ page }) => {
  await login(page);
  await page.route("**/api/seating", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          rows: 1,
          columns: 8,
          students: [
            { id: "male", name: "男同学", studentNo: "M001", gender: "MALE" },
            { id: "female", name: "女同学", studentNo: "F001", gender: "FEMALE" },
            { id: "inferred-male", name: "蒋志豪", studentNo: "U001", gender: "OTHER" },
            { id: "inferred-female", name: "赵雅涵", studentNo: "U002", gender: "OTHER" },
            { id: "unknown", name: "未知同学", studentNo: "U003", gender: "OTHER" },
          ],
          assignments: [
            { studentId: "male", row: 1, column: 1 },
            { studentId: "female", row: 1, column: 2 },
            { studentId: "inferred-male", row: 1, column: 3 },
            { studentId: "inferred-female", row: 1, column: 4 },
            { studentId: "unknown", row: 1, column: 5 },
          ],
          environment: {
            aisleAfterColumns: [2, 6],
            left: { windows: [], doorRows: [] },
            right: { windows: [], doorRows: [] },
            rear: { waterDispenser: null, airConditioner: null },
          },
        },
      }),
    });
  });
  await page.goto("/seating");

  const firstSeat = page.locator(".seat-student").first();
  await expect(firstSeat).toBeVisible();
  await expect(firstSeat.locator(".seat-student-name")).not.toBeEmpty();
  await expect(firstSeat.locator(".seat-student-copy")).not.toContainText(/\d/);
  await expect(firstSeat.locator(".student-avatar")).toHaveCount(0);
  await expect(page.locator(".seat-student-name").first()).toBeVisible();
  await expect(page.locator(".seat-student-male")).not.toHaveCount(0);
  await expect(page.locator(".seat-student-female")).not.toHaveCount(0);
  await expect(page.locator(".seat-student-neutral")).not.toHaveCount(0);
});

test("桌面右键座位卡打开受控操作菜单并可删除", async ({ page }) => {
  await login(page);
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();

  const firstCell = page.locator(".seat-cell-filled").first();
  await expect(firstCell.locator(":scope > .ant-select")).toHaveCount(0);
  await firstCell.locator(".seat-student").click({ button: "right" });
  const replacementMenu = page.locator(".ant-dropdown-menu");
  await expect(replacementMenu).toBeVisible();
  await expect(replacementMenu.getByRole("menuitem", { name: "移出座位" })).toBeVisible();
  await expect(page.locator(".seat-clear-button")).toHaveCount(0);
  await replacementMenu.getByRole("menuitem", { name: "移出座位" }).click();
  await expect(page.getByText("有未保存修改", { exact: true })).toBeVisible();
});

test("点击座位学生的选择菜单可以通过外部点击和 Escape 收起", async ({ page }) => {
  await login(page);
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();

  const seat = page.locator(".seat-cell-filled .seat-student").first();
  const menu = page.locator(".ant-dropdown-menu");
  await seat.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();

  await seat.click();
  await expect(menu).toBeVisible();
  await page.locator(".seating-canvas-toolbar").click();
  await expect(menu).toBeHidden();
});

test("编辑态空座不显示下拉框且学生姓名居中显示", async ({ page }) => {
  await login(page);
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();

  await expect(page.locator(".seat-cell-empty .ant-select")).toHaveCount(0);
  const studentName = page.locator(".seat-cell-filled .seat-student-name").first();
  await expect(studentName).toBeVisible();
  await expect(studentName).toHaveCSS("text-align", "center");
  await expect(studentName).toHaveCSS("font-size", "14px");
});

test.describe("移动端座位操作", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

test("长按座位卡打开删除操作", async ({ page }) => {
  await login(page);
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();

  const seat = page.locator(".seat-cell-filled .seat-student").first();
  await expect(seat).toBeVisible();
  await seat.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 20 });
  await seat.dispatchEvent("pointermove", { pointerType: "touch", pointerId: 1, clientX: 40, clientY: 20 });
  await page.waitForTimeout(650);
  await expect(page.locator(".ant-dropdown-menu")).toHaveCount(0);
  await seat.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1 });

  await seat.dispatchEvent("pointerdown", { pointerType: "touch", pointerId: 1 });
  await page.waitForTimeout(650);
  const menu = page.locator(".ant-dropdown-menu");
  await expect(menu.getByRole("menuitem", { name: "移出座位" })).toBeVisible();
  await seat.dispatchEvent("pointerup", { pointerType: "touch", pointerId: 1 });
  await menu.getByRole("menuitem", { name: "移出座位" }).click();
  await expect(page.getByRole("button", { name: "保存座次" })).toBeEnabled();
});
});

test("座次表桌面端完整展示座位矩阵", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await page.route("**/api/seating", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          rows: 7,
          columns: 8,
          students: [],
          assignments: [],
          environment: {
            aisleAfterColumns: [2, 6],
            left: { windows: [], doorRows: [] },
            right: { windows: [], doorRows: [] },
            rear: { waterDispenser: null, airConditioner: null },
          },
        },
      }),
    });
  });
  await page.goto("/seating");
  await page.locator(".seat-grid").waitFor();

  const layout = await page.evaluate(() => {
    const scroll = document.querySelector(".seating-map-scroll");
    const map = document.querySelector(".seating-map");
    const grid = document.querySelector(".seat-grid");
    return {
      scrollWidth: scroll?.scrollWidth ?? 0,
      scrollClientWidth: scroll?.clientWidth ?? 0,
      mapWidth: map?.getBoundingClientRect().width ?? 0,
      gridWidth: grid?.getBoundingClientRect().width ?? 0,
      seatCount: document.querySelectorAll(".seat-cell").length,
      aisleCount: document.querySelectorAll(".seat-aisle").length,
      gridTrackCount: (getComputedStyle(grid ?? document.body).gridTemplateColumns.match(/[^\s]+/g) ?? []).length,
      sideMarkerCount: document.querySelectorAll(".room-side-marker").length,
    };
  });

  expect(layout.scrollWidth).toBeLessThanOrEqual(layout.scrollClientWidth + 1);
  expect(layout.gridWidth).toBeLessThanOrEqual(layout.mapWidth + 1);
  expect(layout.seatCount).toBe(56);
  expect(layout.aisleCount).toBe(14);
  expect(layout.gridTrackCount).toBe(10);
  expect(layout.sideMarkerCount).toBe(14);
});

test("学生池编辑开始即显示且不压缩画布", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();
  await expect(page.locator(".seating-sidebar-floating")).toBeVisible();

  const layout = await page.evaluate(() => {
    const body = document.querySelector(".seating-workspace-body-editing");
    const canvas = document.querySelector(".seating-workspace-body-editing .seating-canvas-section");
    const sidebar = document.querySelector(".seating-sidebar-floating");
    const bodyRect = body?.getBoundingClientRect();
    const canvasRect = canvas?.getBoundingClientRect();
    const sidebarRect = sidebar?.getBoundingClientRect();
    return {
      bodyWidth: bodyRect?.width ?? 0,
      canvasWidth: canvasRect?.width ?? 0,
      sidebarWidth: sidebarRect?.width ?? 0,
      sidebarLeft: sidebarRect?.left ?? 0,
      bodyLeft: bodyRect?.left ?? 0,
      sidebarRight: sidebarRect?.right ?? 0,
      bodyRight: bodyRect?.right ?? 0,
      viewportWidth: window.innerWidth,
    };
  });

  expect(layout.canvasWidth).toBeGreaterThanOrEqual(layout.bodyWidth - 1);
  expect(layout.sidebarWidth).toBeGreaterThan(0);
  expect(layout.sidebarLeft).toBeGreaterThanOrEqual(0);
  expect(layout.sidebarRight).toBeLessThanOrEqual(layout.viewportWidth + 1);
  await expect(page.getByRole("button", { name: "收起编辑工具" })).toHaveCount(0);
});

test("座位布局、过道与教室标记使用独立交互", async ({ page }) => {
  await login(page);
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();
  await page.getByRole("button", { name: "座位布局" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "座位布局" })).toBeVisible();
  await expect(dialog.getByRole("checkbox")).toHaveCount(0);
  await expect(dialog.getByText("教室标记", { exact: true })).toHaveCount(0);
  await page.locator(".ant-modal-footer").getByRole("button", { name: /取\s*消/ }).click();
  await expect(page.getByText("有未保存修改", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "过道设置" }).click();
  const aisleDialog = page.getByRole("dialog");
  await expect(aisleDialog.getByRole("heading", { name: "过道插入位置" })).toBeVisible();
  await expect(aisleDialog.getByRole("checkbox", { name: "第 2 列后" })).toBeVisible();
  await aisleDialog.getByRole("checkbox", { name: "第 1 列后" }).click();
  await aisleDialog.locator(".ant-modal-footer").getByRole("button", { name: "应用过道" }).click();
  await expect(aisleDialog).toBeHidden();
  await expect(page.getByText("有未保存修改", { exact: true })).toBeVisible();

  await expect(page.locator('[data-side="left"][data-marker-row="1"]')).toHaveCount(1);
  await expect(page.locator(".room-side-marker")).toHaveCount(14);
  await page.locator('[data-side="left"][data-marker-row="1"]').click({ force: true });
  await expect(page.locator('[data-side="left"][data-marker-row="1"]')).toContainText("窗户");
  await page.locator('[data-fixed-side="LEFT"][data-fixed-position="1"] button[aria-label*="饮水机"]').click({ force: true });
  await expect(page.locator('[data-fixed-side="LEFT"][data-fixed-position="1"] .room-fixed-facility-selected')).toHaveCount(1);
});

test("座次图将前后侧作为固定边界并把设施固定在左右侧", async ({ page }) => {
  await login(page);
  await page.route("**/api/seating", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          rows: 2,
          columns: 4,
          students: [],
          assignments: [],
          environment: {
            aisleAfterColumns: [2],
            left: { windows: [], doorRows: [] },
            right: { windows: [], doorRows: [] },
            rear: { waterDispenser: "LEFT", airConditioner: "RIGHT" },
            fixedFacilities: {
              waterDispenser: { side: "LEFT", position: 2 },
              airConditioner: { side: "FRONT", position: 3 },
            },
          },
        },
      }),
    });
  });
  await page.goto("/seating");

  await expect(page.locator(".room-front")).toContainText("前方");
  await expect(page.locator(".room-front")).toContainText("固定");
  await expect(page.locator(".room-back")).toContainText("后方");
  await expect(page.locator(".room-back")).toContainText("固定");
  await expect(page.locator('[data-fixed-side="LEFT"][data-fixed-position="2"] .room-fixed-facility-waterDispenser')).toBeVisible();
  await expect(page.locator('[data-fixed-side="FRONT"][data-fixed-position="3"] .room-fixed-facility-airConditioner')).toBeVisible();

  const alignment = await page.evaluate(() => {
    const leftSeat = document.querySelector('[data-seat-row="2"][data-seat-column="1"]')?.getBoundingClientRect();
    const frontSeat = document.querySelector('[data-seat-row="1"][data-seat-column="3"]')?.getBoundingClientRect();
    const leftFacility = document.querySelector('[data-fixed-side="LEFT"][data-fixed-position="2"]')?.getBoundingClientRect();
    const frontFacility = document.querySelector('[data-fixed-side="FRONT"][data-fixed-position="3"]')?.getBoundingClientRect();
    return {
      leftDelta: Math.abs(
        ((leftFacility?.top ?? 0) + (leftFacility?.height ?? 0) / 2)
        - ((leftSeat?.top ?? 0) + (leftSeat?.height ?? 0) / 2),
      ),
      frontDelta: Math.abs(
        ((frontFacility?.left ?? 0) + (frontFacility?.width ?? 0) / 2)
        - ((frontSeat?.left ?? 0) + (frontSeat?.width ?? 0) / 2),
      ),
    };
  });
  expect(alignment.leftDelta).toBeLessThanOrEqual(1);
  expect(alignment.frontDelta).toBeLessThanOrEqual(1);
});

test("固定设施可以在左右前后槽位间使用同一套切换逻辑", async ({ page }) => {
  await login(page);
  await page.route("**/api/seating", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          rows: 3,
          columns: 4,
          students: [],
          assignments: [],
          environment: {
            aisleAfterColumns: [2],
            left: { windows: [], doorRows: [] },
            right: { windows: [], doorRows: [] },
            rear: { waterDispenser: null, airConditioner: null },
            fixedFacilities: { waterDispenser: null, airConditioner: null },
          },
        },
      }),
    });
  });
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();

  await page.locator('[data-fixed-side="RIGHT"][data-fixed-position="2"] button[aria-label*="饮水机"]').click({ force: true });
  await expect(page.locator('[data-fixed-side="RIGHT"][data-fixed-position="2"] .room-fixed-facility-selected')).toHaveCount(1);
  await page.locator('[data-fixed-side="BACK"][data-fixed-position="3"] button[aria-label*="饮水机"]').click({ force: true });
  await expect(page.locator('[data-fixed-side="RIGHT"][data-fixed-position="2"] .room-fixed-facility-selected')).toHaveCount(0);
  await expect(page.locator('[data-fixed-side="BACK"][data-fixed-position="3"] .room-fixed-facility-selected')).toHaveCount(1);
});

test("座次页顶部配置区域在桌面端保持单行", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await page.goto("/seating");

  const toolbarLayout = await page.locator(".seating-canvas-toolbar").evaluate((toolbar) => ({
    height: toolbar.getBoundingClientRect().height,
    width: toolbar.getBoundingClientRect().width,
    scrollWidth: toolbar.scrollWidth,
  }));

  expect(toolbarLayout.height).toBeLessThanOrEqual(44);
  expect(toolbarLayout.scrollWidth).toBeLessThanOrEqual(toolbarLayout.width + 1);
});

test("学生池浮动窗口可以拖动", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });
  await login(page);
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();

  const panel = page.locator(".seating-sidebar-floating");
  await expect(page.getByRole("button", { name: "打开学生池" })).toBeVisible();
  const handle = panel.locator(".seating-sidebar-floating-handle");
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  const initialBox = await panel.boundingBox();
  expect(initialBox).not.toBeNull();
  const canvasBox = await page.locator(".seating-canvas-section").boundingBox();
  expect(canvasBox).not.toBeNull();
  expect(initialBox!.x).toBeGreaterThanOrEqual(canvasBox!.x);
  expect(initialBox!.x).toBeLessThanOrEqual(canvasBox!.x + 24);
  expect(initialBox!.y).toBeGreaterThanOrEqual(canvasBox!.y);
  expect(initialBox!.y).toBeLessThanOrEqual(canvasBox!.y + 24);
  await page.mouse.move(handleBox!.x + 12, handleBox!.y + 10);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x - 120, handleBox!.y + 10);
  await page.mouse.up();
  const nextBox = await panel.boundingBox();
  expect(nextBox).not.toBeNull();
  expect(nextBox!.x).toBeLessThan(initialBox!.x);

  await page.setViewportSize({ width: 1000, height: 844 });
  await expect(panel).toBeVisible();
  await expect.poll(async () => {
    const box = await panel.boundingBox();
    return Boolean(box && box.x >= 0 && box.x + box.width <= 1000);
  }).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel).toBeVisible();
  await expect.poll(async () => {
    const box = await panel.boundingBox();
    return Boolean(box && box.x >= 0 && box.x + box.width <= 390);
  }).toBe(true);
});

test("学生池可以搜索对应学生", async ({ page }) => {
  await login(page);
  await page.route("**/api/seating", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          rows: 1,
          columns: 4,
          students: [
            { id: "search-1", name: "张瀞涵", studentNo: "S001", gender: "OTHER" },
            { id: "search-2", name: "蒋志豪", studentNo: "S002", gender: "OTHER" },
          ],
          assignments: [{ studentId: "search-2", row: 1, column: 1 }],
          environment: {
            aisleAfterColumns: [2],
            left: { windows: [], doorRows: [] },
            right: { windows: [], doorRows: [] },
            rear: { waterDispenser: null, airConditioner: null },
          },
        },
      }),
    });
  });
  await page.goto("/seating");
  await page.getByRole("button", { name: "编辑座次" }).click();
  await page.getByRole("button", { name: "打开学生池" }).click();

  const pool = page.locator(".seating-sidebar-floating");
  const search = pool.getByPlaceholder("搜索学生");
  await expect(search).toBeVisible();
  await expect(page.locator("#student-pool-unassigned-count")).toContainText("1");
  await expect(pool.locator(".student-pool-summary")).toContainText("待安排");
  await expect(pool.locator(".student-pool-summary")).toContainText("1");
  await expect(pool.locator(".student-pool-item")).toHaveCount(2);
  await expect(pool.locator(".student-pool-item").first()).toContainText("张瀞涵");
  await expect(pool.locator(".student-pool-item").last()).toContainText("蒋志豪");
  await expect(pool.locator(".student-pool-item").first().locator(".student-pool-item-status")).toHaveText("未分配");
  await expect(pool.locator(".student-pool-item").last().locator(".student-pool-item-status")).toHaveText("已安排");
  await search.fill("瀞涵");
  await expect(pool.locator(".student-pool-item")).toHaveCount(1);
  await expect(pool.locator(".student-pool-item").first()).toContainText("张瀞涵");
  await search.fill("不存在");
  await expect(pool.getByText("没有匹配的学生", { exact: true })).toBeVisible();
});

test("学生编辑侧滑面板在移动端保持独立滚动和固定操作区", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/students");

  await page.getByRole("button", { name: "新增学生" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "学生信息" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "保存资料" })).toBeVisible();

  const drawerLayout = await page.evaluate(() => {
    const body = document.querySelector(".ant-drawer-open .ant-drawer-body");
    const footer = document.querySelector(".ant-drawer-open .ant-drawer-footer");
    const bodyRect = body?.getBoundingClientRect();
    const footerRect = footer?.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      bodyBottom: bodyRect?.bottom ?? 0,
      footerTop: footerRect?.top ?? 0,
      footerBottom: footerRect?.bottom ?? 0,
      viewportHeight: window.innerHeight,
    };
  });
  expect(drawerLayout.documentWidth).toBeLessThanOrEqual(drawerLayout.viewportWidth + 1);
  expect(drawerLayout.footerTop).toBeGreaterThanOrEqual(drawerLayout.bodyBottom - 1);
  expect(drawerLayout.footerBottom).toBeLessThanOrEqual(drawerLayout.viewportHeight + 1);
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
