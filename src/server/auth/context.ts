import { cookies } from "next/headers";

import { UserStatus } from "@/generated/prisma/enums";
import { ApiError } from "@/server/api/errors";
import { prisma } from "@/server/db/prisma";

import {
  hashSessionToken,
  isSessionExpired,
  SESSION_COOKIE_NAME,
} from "./session";

export interface AuthContext {
  userId: string;
  username: string;
  displayName: string;
  userRole: "ADMIN" | "HEAD_TEACHER";
  classId: string;
  className: string;
  grade: string;
  room: string | null;
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  const tokenHash = hashSessionToken(token);
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: {
      user: {
        include: {
          memberships: {
            include: { classroom: true },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });

  if (
    !session ||
    isSessionExpired(session.expiresAt) ||
    session.user.status !== UserStatus.ACTIVE
  ) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  const membership = session.user.memberships[0];
  if (!membership) {
    return null;
  }

  return {
    userId: session.user.id,
    username: session.user.username,
    displayName: session.user.displayName,
    userRole: session.user.role,
    classId: membership.classId,
    className: membership.classroom.name,
    grade: membership.classroom.grade,
    room: membership.classroom.room,
  };
}

export async function requireAuthContext(): Promise<AuthContext> {
  const context = await getAuthContext();
  if (!context) {
    throw new ApiError(401, "UNAUTHORIZED", "登录已过期，请重新登录");
  }
  return context;
}
