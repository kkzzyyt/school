import { NextResponse } from "next/server";

import { prisma } from "@/server/db/prisma";

const HEALTHCHECK_TIMEOUT_MS = 5_000;

async function verifyDatabaseReadiness() {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Health check database query timed out")),
          HEALTHCHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

export async function GET() {
  try {
    await verifyDatabaseReadiness();
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: { code: "SERVICE_UNAVAILABLE", message: "服务暂时不可用" },
      },
      { status: 503 },
    );
  }

  return NextResponse.json({
    success: true,
    data: { status: "ok", timestamp: new Date().toISOString() },
  });
}
