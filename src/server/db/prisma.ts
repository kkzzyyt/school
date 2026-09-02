import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const DATABASE_TIMEOUT_DEFAULTS = {
  acquireTimeout: "2000",
  connectTimeout: "1000",
  queryTimeout: "2000",
};

export function withDatabaseTimeouts(databaseUrl: string): string {
  try {
    const url = new URL(databaseUrl);
    for (const [name, value] of Object.entries(DATABASE_TIMEOUT_DEFAULTS)) {
      if (!url.searchParams.has(name)) {
        url.searchParams.set(name, value);
      }
    }
    return url.toString();
  } catch {
    return databaseUrl;
  }
}

function createPrismaClient(): PrismaClient {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "mysql://school:school_dev_password@127.0.0.1:3307/school";
  const adapter = new PrismaMariaDb(withDatabaseTimeouts(databaseUrl));

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
