import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";
import { assertSameOrigin } from "@/server/auth/origin";
import {
  hashSessionToken,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";

export async function POST(request: Request): Promise<NextResponse> {
  try {
    assertSameOrigin(request);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "FORBIDDEN", message: "请求来源不受信任" },
      },
      { status: 403 },
    );
  }

  const token = request.headers
    .get("cookie")
    ?.split(";")
    .map((item) => item.trim().split("="))
    .find(([name]) => name === SESSION_COOKIE_NAME)?.[1];

  if (token) {
    await prisma.session
      .deleteMany({ where: { tokenHash: hashSessionToken(token) } })
      .catch(() => undefined);
  }

  const response = NextResponse.json({ success: true, data: null });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
