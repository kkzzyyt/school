import { describe, expect, it } from "vitest";

import {
  createSessionCredential,
  hashSessionToken,
  isSessionExpired,
} from "./session";

describe("session credentials", () => {
  it("creates an unpredictable raw token and stores only its hash", () => {
    const first = createSessionCredential();
    const second = createSessionCredential();

    expect(first.token).not.toBe(second.token);
    expect(first.token).toHaveLength(64);
    expect(first.tokenHash).toBe(hashSessionToken(first.token));
    expect(first.tokenHash).not.toContain(first.token);
  });

  it("detects expired sessions at the boundary timestamp", () => {
    const now = new Date("2026-09-01T00:00:00.000Z");

    expect(isSessionExpired(now, now)).toBe(true);
    expect(
      isSessionExpired(new Date("2026-09-01T00:00:00.001Z"), now),
    ).toBe(false);
  });
});
