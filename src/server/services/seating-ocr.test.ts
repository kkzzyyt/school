import { afterEach, describe, expect, it, vi } from "vitest";

import { detectSeatingImageMime, recognizeSeatingImage } from "./seating-ocr";

const png = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);

describe("server/services/seating-ocr", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SEATING_OCR_URL;
  });

  it("checks the actual image signature", () => {
    expect(detectSeatingImageMime(png)).toBe("image/png");
    expect(detectSeatingImageMime(Uint8Array.from([255, 216, 255, 0]))).toBe("image/jpeg");
    expect(detectSeatingImageMime(Uint8Array.from([1, 2, 3]))).toBeNull();
  });

  it("sends image bytes only to the loopback OCR service and validates boxes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      width: 400,
      height: 300,
      lines: [{ text: "张三", score: 0.95, box: [10, 20, 80, 45] }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(recognizeSeatingImage(png, "image/png")).resolves.toMatchObject({
      lines: [{ text: "张三", score: 0.95 }],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:8077/recognize",
      expect.objectContaining({ method: "POST", headers: { "Content-Type": "image/png" } }),
    );
  });

  it("rejects an OCR URL outside the local host", async () => {
    process.env.SEATING_OCR_URL = "https://example.com";
    vi.stubGlobal("fetch", vi.fn());

    await expect(recognizeSeatingImage(png, "image/png")).rejects.toMatchObject({ status: 503 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a local OCR outage without leaking upstream details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network details")));
    await expect(recognizeSeatingImage(png, "image/png")).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("network details"),
    });
  });
});
