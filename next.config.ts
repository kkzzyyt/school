import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  compress: true,
  experimental: {
    optimizePackageImports: ["antd", "@ant-design/icons", "dayjs", "recharts"],
  },
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
  async headers() {
    return [
      {
        source: "/films/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        source: "/images/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
