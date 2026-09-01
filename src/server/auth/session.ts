import { createHash, randomBytes } from "node:crypto";

export const SESSION_COOKIE_NAME = "school_session";
export const SESSION_DURATION_DAYS = 7;

export interface SessionCredential {
  token: string;
  tokenHash: string;
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createSessionCredential(): SessionCredential {
  const token = randomBytes(32).toString("hex");
  return { token, tokenHash: hashSessionToken(token) };
}

export function getSessionExpiration(now = new Date()): Date {
  const expiration = new Date(now);
  expiration.setUTCDate(expiration.getUTCDate() + SESSION_DURATION_DAYS);
  return expiration;
}

export function isSessionExpired(expiresAt: Date, now = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}
