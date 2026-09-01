import { verify } from "argon2";
import { NextResponse } from "next/server";
import { z } from "zod";

import { UserStatus } from "@/generated/prisma/enums";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import {
  createSessionCredential,
  getSessionExpiration,
  SESSION_COOKIE_NAME,
} from "@/server/auth/session";

const loginSchema = z.object({
  username: z.string().trim().min(1, "请输入用户名").max(50),
  password: z.string().min(1, "请输入密码").max(200),
});

const INVALID_CREDENTIALS_RESPONSE = {
  success: false,
  error: { code: "INVALID_CREDENTIALS", message: "用户名或密码错误" },
};

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

  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: parsed.error.issues[0]?.message ?? "请求参数不正确",
        },
      },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { username: parsed.data.username },
  });
  const passwordMatches = user
    ? await verify(user.passwordHash, parsed.data.password).catch(() => false)
    : false;

  if (!user || !passwordMatches || user.status !== UserStatus.ACTIVE) {
    return NextResponse.json(INVALID_CREDENTIALS_RESPONSE, { status: 401 });
  }

  const credential = createSessionCredential();
  const expiresAt = getSessionExpiration();

  await prisma.$transaction([
    prisma.session.create({
      data: { tokenHash: credential.tokenHash, userId: user.id, expiresAt },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    }),
  ]);

  const response = NextResponse.json({
    success: true,
    data: { displayName: user.displayName },
  });
  response.cookies.set(SESSION_COOKIE_NAME, credential.token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return response;
}
