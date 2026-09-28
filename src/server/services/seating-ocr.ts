import { z } from "zod";

import type { SeatingOcrResult } from "@/domain/seating-ocr";
import { ApiError } from "@/server/api/errors";

const responseSchema = z.object({
  width: z.number().int().min(100).max(10000),
  height: z.number().int().min(100).max(10000),
  lines: z.array(z.object({
    text: z.string().max(120),
    score: z.number().min(0).max(1),
    box: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  })).max(200),
});

export type SeatingImageMime = "image/png" | "image/jpeg" | "image/webp";

export function detectSeatingImageMime(bytes: Uint8Array): SeatingImageMime | null {
  if (
    bytes.length >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)
  ) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF"
    && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) return "image/webp";
  return null;
}

function getLocalOcrEndpoint(): string {
  try {
    const configured = process.env.SEATING_OCR_URL ?? "http://127.0.0.1:8077";
    const url = new URL(configured);
    if (
      url.protocol !== "http:"
      || !["127.0.0.1", "localhost"].includes(url.hostname)
      || url.username
      || url.password
      || (url.pathname !== "/" && url.pathname !== "")
      || url.search
      || url.hash
    ) throw new Error("invalid OCR endpoint");
    return new URL("/recognize", url).toString();
  } catch {
    throw new ApiError(503, "INTERNAL_ERROR", "本地图片识别服务配置不正确");
  }
}

export async function recognizeSeatingImage(
  bytes: Uint8Array,
  mime: SeatingImageMime,
): Promise<SeatingOcrResult> {
  const endpoint = getLocalOcrEndpoint();
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": mime },
      body: new Uint8Array(bytes),
      cache: "no-store",
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    throw new ApiError(503, "INTERNAL_ERROR", "本地图片识别服务暂时不可用，请稍后重试");
  }
  if (response.status >= 400 && response.status < 500) {
    throw new ApiError(400, "VALIDATION_ERROR", "图片格式或尺寸不符合识别要求");
  }
  if (!response.ok) {
    throw new ApiError(503, "INTERNAL_ERROR", "本地图片识别服务暂时不可用，请稍后重试");
  }
  try {
    return responseSchema.parse(await response.json());
  } catch {
    throw new ApiError(503, "INTERNAL_ERROR", "本地图片识别服务返回了无效结果");
  }
}
