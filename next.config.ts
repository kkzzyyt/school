import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["argon2"],
  outputFileTracingIncludes: {
    "/*": [
      "node_modules/argon2/**/*",
      "node_modules/@prisma/adapter-mariadb/**/*",
      "node_modules/@prisma/driver-adapter-utils/**/*",
      "node_modules/@prisma/debug/**/*",
      "node_modules/mariadb/**/*",
      "node_modules/denque/**/*",
      "node_modules/iconv-lite/**/*",
      "node_modules/lru-cache/**/*",
      "node_modules/safer-buffer/**/*",
    ],
  },
};

export default nextConfig;
