#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
OUTPUT_DIR="$PROJECT_ROOT/releases"
SKIP_CHECKS=false

usage() {
  cat <<'EOF'
用法：scripts/package-standalone-deploy.sh [选项]

将已经由 Linux CI 构建完成的 Next.js standalone 产物打成可发布包。

选项：
  --output-dir <目录>  指定发布包输出目录，默认是项目下的 releases/
  --skip-checks        跳过 lint、类型检查和单元测试
  -h, --help           显示帮助

要求：
  构建前应已生成 .next/standalone/server.js。
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output-dir)
      [[ $# -ge 2 ]] || { printf '%s\n' '--output-dir 缺少目录参数' >&2; exit 2; }
      OUTPUT_DIR="$2"
      shift 2
      ;;
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '未知参数：%s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

for required_command in cp date du env find git gzip grep mkdir mktemp node rm shasum stat tar; do
  command -v "$required_command" >/dev/null 2>&1 || {
    printf '缺少命令：%s\n' "$required_command" >&2
    exit 1
  }
done

[[ -f "$PROJECT_ROOT/package.json" ]] || { printf '%s\n' '找不到 package.json' >&2; exit 1; }
[[ -f "$PROJECT_ROOT/.next/standalone/server.js" ]] || {
  printf '%s\n' '找不到 .next/standalone/server.js，请先运行 Linux 生产构建' >&2
  exit 1
}
[[ -d "$PROJECT_ROOT/.next/static" ]] || { printf '%s\n' '找不到 .next/static' >&2; exit 1; }
[[ -d "$PROJECT_ROOT/public" ]] || { printf '%s\n' '找不到 public/' >&2; exit 1; }
[[ -d "$PROJECT_ROOT/prisma/migrations" ]] || { printf '%s\n' '找不到 prisma/migrations' >&2; exit 1; }

if [[ "$SKIP_CHECKS" == false ]]; then
  printf '%s\n' '[1/4] 运行 ESLint'
  (cd "$PROJECT_ROOT" && npm run lint)
  printf '%s\n' '[2/4] 运行 TypeScript 检查'
  (cd "$PROJECT_ROOT" && npm run typecheck)
  printf '%s\n' '[3/4] 运行单元测试'
  (cd "$PROJECT_ROOT" && npm test)
else
  printf '%s\n' '[1/4] 已跳过代码检查'
  printf '%s\n' '[2/4] 已跳过类型检查'
  printf '%s\n' '[3/4] 已跳过单元测试'
fi

mkdir -p "$OUTPUT_DIR"
OUTPUT_DIR="$(cd "$OUTPUT_DIR" && pwd -P)"
[[ "$OUTPUT_DIR" != "$PROJECT_ROOT" ]] || { printf '%s\n' '输出目录不能是项目根目录' >&2; exit 2; }
for reserved_output_dir in "$PROJECT_ROOT/src" "$PROJECT_ROOT/public" "$PROJECT_ROOT/prisma" "$PROJECT_ROOT/.next"; do
  [[ "$OUTPUT_DIR" != "$reserved_output_dir" ]] || {
    printf '输出目录不能使用源码或构建目录：%s\n' "$reserved_output_dir" >&2
    exit 2
  }
done

BUILD_ID="$(cat "$PROJECT_ROOT/.next/BUILD_ID" 2>/dev/null || printf 'unknown')"
[[ "$BUILD_ID" != *[[:space:]]* ]] || { printf '%s\n' 'BUILD_ID 不能包含空白字符' >&2; exit 1; }
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
ARCHIVE_NAME="${PROJECT_NAME}-standalone-${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
STAGING_DIR="$(mktemp -d "${TMPDIR:-/tmp}/school-standalone-stage.XXXXXX")"
STAGING_APP="$STAGING_DIR/$PROJECT_NAME"

cleanup() {
  rm -rf "$STAGING_DIR"
}
trap cleanup EXIT

mkdir -p "$STAGING_APP/.next"
cp -a "$PROJECT_ROOT/.next/standalone" "$STAGING_APP/.next/standalone"
STANDALONE_PACKAGE_JSON="$STAGING_APP/.next/standalone/package.json"
[[ -f "$STANDALONE_PACKAGE_JSON" ]] || { printf '%s\n' 'standalone 产物缺少 package.json' >&2; exit 1; }
if ! env -u NODE_PATH node -e 'const { createRequire } = require("node:module"); createRequire(process.argv[1])("@prisma/adapter-mariadb");' "$STANDALONE_PACKAGE_JSON"; then
  printf '%s\n' 'standalone 产物缺少可加载的 Prisma 运行时依赖' >&2
  exit 1
fi
mkdir -p "$STAGING_APP/.next/standalone/.next/static" "$STAGING_APP/.next/standalone/public"
cp -a "$PROJECT_ROOT/.next/static" "$STAGING_APP/.next/static"
cp -a "$PROJECT_ROOT/public" "$STAGING_APP/public"
cp -a "$PROJECT_ROOT/.next/static/." "$STAGING_APP/.next/standalone/.next/static/"
cp -a "$PROJECT_ROOT/public/." "$STAGING_APP/.next/standalone/public/"
cp -a "$PROJECT_ROOT/prisma" "$STAGING_APP/prisma"
cp "$PROJECT_ROOT/package.json" "$STAGING_APP/package.json"
cp "$PROJECT_ROOT/package-lock.json" "$STAGING_APP/package-lock.json"
cp "$PROJECT_ROOT/next.config.ts" "$STAGING_APP/next.config.ts"
cp "$PROJECT_ROOT/tsconfig.json" "$STAGING_APP/tsconfig.json"
cp "$PROJECT_ROOT/prisma.config.ts" "$STAGING_APP/prisma.config.ts"
if [[ -d "$PROJECT_ROOT/src/generated/prisma" ]]; then
  mkdir -p "$STAGING_APP/src/generated"
  cp -a "$PROJECT_ROOT/src/generated/prisma" "$STAGING_APP/src/generated/prisma"
fi
{
  printf 'commit=%s\n' "$(git -C "$PROJECT_ROOT" rev-parse HEAD 2>/dev/null || printf 'working')"
  printf 'build_id=%s\n' "$BUILD_ID"
  printf 'built_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  printf 'format=next-standalone\n'
} > "$STAGING_APP/release-manifest.txt"

printf '%s\n' '[4/4] 生成 standalone 发布包'
LC_ALL=C COPYFILE_DISABLE=1 tar --no-xattrs -czf "$ARCHIVE_PATH" -C "$STAGING_DIR" "$PROJECT_NAME"

ARCHIVE_CONTENTS="$(LC_ALL=C tar -tzf "$ARCHIVE_PATH")"
for secret_pattern in \
  '(^|/)\.env[^/]*$' \
  '(^|/)\.(npmrc|yarnrc|yarnrc\.yml|pnpmrc)$' \
  '\.(pem|key|p12|pfx|jks)$' \
  '(^|/)(id_rsa|id_ed25519)$' \
  '(credentials|service-account|serviceaccount|secret)[^/]*\.json$' \
  '(^|/)\._[^/]*$'; do
  if grep -Eiq "$secret_pattern" <<<"$ARCHIVE_CONTENTS"; then
    rm -f "$ARCHIVE_PATH"
    printf '发布包安全检查失败，发现疑似秘密文件：%s\n' "$secret_pattern" >&2
    exit 1
  fi
done

for forbidden_pattern in \
  "^${PROJECT_NAME//./\\.}/node_modules/" \
  "^${PROJECT_NAME//./\\.}/\.next/(dev|cache)(/|$)"; do
  if grep -Eiq "$forbidden_pattern" <<<"$ARCHIVE_CONTENTS"; then
    rm -f "$ARCHIVE_PATH"
    printf '发布包安全检查失败，发现禁止路径：%s\n' "$forbidden_pattern" >&2
    exit 1
  fi
done

if grep -Eq "(^|/)\.next/standalone/server\.js$" <<<"$ARCHIVE_CONTENTS"; then
  :
else
  rm -f "$ARCHIVE_PATH"
  printf '%s\n' '发布包安全检查失败，缺少 standalone/server.js' >&2
  exit 1
fi

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$OUTPUT_DIR" && sha256sum "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256")
else
  (cd "$OUTPUT_DIR" && shasum -a 256 "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256")
fi

ARCHIVE_SIZE="$(du -h "$ARCHIVE_PATH" | awk '{print $1}')"
printf '\n%s\n' 'standalone 打包完成'
printf '发布包：%s\n' "$ARCHIVE_PATH"
printf '校验文件：%s\n' "$CHECKSUM_PATH"
printf '大小：%s\n' "$ARCHIVE_SIZE"
