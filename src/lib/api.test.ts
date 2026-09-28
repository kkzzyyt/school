import { afterEach, describe, expect, it, vi } from "vitest";

import { apiRequest } from "./api";

function unauthorizedResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
    }),
    {
      status: 401,
      headers: { "Content-Type": "application/json" },
    },
  );
}

describe("apiRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("登录凭据错误时允许保留当前页面并抛出接口错误", async () => {
    const replace = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(unauthorizedResponse());
    vi.stubGlobal("window", { location: { replace } });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "teacher", password: "wrong" }),
        redirectOnUnauthorized: false,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
      message: "用户名或密码错误",
    });

    expect(replace).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/login",
      expect.not.objectContaining({ redirectOnUnauthorized: false }),
    );
  });

  it("普通请求未授权时默认跳转登录页", async () => {
    const replace = vi.fn();
    vi.stubGlobal("window", { location: { replace } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(unauthorizedResponse()));

    await expect(apiRequest("/api/dashboard")).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });

    expect(replace).toHaveBeenCalledWith("/login");
  });

  it("上传 FormData 时保留浏览器自动生成的 multipart boundary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, data: { ok: true } }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["content"], { type: "text/csv" }), "seats.csv");

    await apiRequest("/api/seating/imports", { method: "POST", body: formData });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/seating/imports",
      expect.objectContaining({
        body: formData,
        headers: {},
      }),
    );
  });
});
