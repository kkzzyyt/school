#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-standalone-package-test.XXXXXX")"
OUTPUT_DIR="$TEST_ROOT/output"
CREATED_NEXT=false
FIXTURE_PUBLIC_FILE="$PROJECT_ROOT/public/.standalone-package-test-fixture"
MISSING_RUNTIME_OUTPUT="$TEST_ROOT/missing-prisma-runtime.out"

cleanup() {
  rm -rf "$TEST_ROOT"
  rm -f "$FIXTURE_PUBLIC_FILE"
  if [[ "$CREATED_NEXT" == true ]]; then
    rm -rf "$PROJECT_ROOT/.next"
  fi
}
trap cleanup EXIT

if [[ -e "$PROJECT_ROOT/.next" || -L "$PROJECT_ROOT/.next" ]]; then
  printf '%s\n' '测试要求项目 worktree 没有现存 .next' >&2
  exit 1
fi

mkdir -p "$PROJECT_ROOT/.next/standalone/.next" "$PROJECT_ROOT/.next/static/chunks" "$PROJECT_ROOT/public"
CREATED_NEXT=true
printf '%s\n' 'test server' > "$PROJECT_ROOT/.next/standalone/server.js"
printf '%s\n' '{"name":"school-standalone-test"}' > "$PROJECT_ROOT/.next/standalone/package.json"
printf '%s\n' 'test static' > "$PROJECT_ROOT/.next/static/chunks/app.js"
printf '%s\n' 'test public' > "$FIXTURE_PUBLIC_FILE"

if NODE_PATH="$PROJECT_ROOT/node_modules" "$PROJECT_ROOT/scripts/package-standalone-deploy.sh" \
  --skip-checks \
  --output-dir "$OUTPUT_DIR" >"$MISSING_RUNTIME_OUTPUT" 2>&1; then
  printf '%s\n' '发布脚本不应接受缺少 Prisma 运行时依赖的 standalone 产物' >&2
  exit 1
fi
grep -Fq 'Prisma 运行时依赖' "$MISSING_RUNTIME_OUTPUT" || {
  sed -n '1,120p' "$MISSING_RUNTIME_OUTPUT" >&2
  printf '%s\n' '发布脚本未报告 Prisma 运行时依赖缺失' >&2
  exit 1
}

mkdir -p \
  "$PROJECT_ROOT/.next/standalone/node_modules/@prisma/adapter-mariadb" \
  "$PROJECT_ROOT/.next/standalone/node_modules/mariadb"
printf '%s\n' '{"name":"@prisma/adapter-mariadb","main":"index.js"}' > "$PROJECT_ROOT/.next/standalone/node_modules/@prisma/adapter-mariadb/package.json"
printf '%s\n' 'require("mariadb"); module.exports = {};' > "$PROJECT_ROOT/.next/standalone/node_modules/@prisma/adapter-mariadb/index.js"
printf '%s\n' '{"name":"mariadb","main":"index.js"}' > "$PROJECT_ROOT/.next/standalone/node_modules/mariadb/package.json"
printf '%s\n' 'module.exports = {};' > "$PROJECT_ROOT/.next/standalone/node_modules/mariadb/index.js"

"$PROJECT_ROOT/scripts/package-standalone-deploy.sh" \
  --skip-checks \
  --output-dir "$OUTPUT_DIR" >/dev/null

archives=("$OUTPUT_DIR/${PROJECT_NAME}-standalone-"*.tar.gz)
(( ${#archives[@]} == 1 )) || { printf '%s\n' '未生成唯一 standalone 发布包' >&2; exit 1; }
ARCHIVE_PATH="${archives[0]}"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
[[ -f "$CHECKSUM_PATH" ]] || { printf '%s\n' '未生成校验文件' >&2; exit 1; }

CONTENTS="$(tar -tzf "$ARCHIVE_PATH")"
for required_path in \
  "$PROJECT_NAME/.next/standalone/server.js" \
  "$PROJECT_NAME/.next/standalone/node_modules/@prisma/adapter-mariadb/index.js" \
  "$PROJECT_NAME/.next/standalone/node_modules/mariadb/index.js" \
  "$PROJECT_NAME/.next/standalone/.next/static/chunks/app.js" \
  "$PROJECT_NAME/.next/standalone/public/.standalone-package-test-fixture" \
  "$PROJECT_NAME/.next/static/chunks/app.js" \
  "$PROJECT_NAME/public/.standalone-package-test-fixture" \
  "$PROJECT_NAME/prisma/schema.prisma" \
  "$PROJECT_NAME/prisma/migrations/20260901000000_init/migration.sql" \
  "$PROJECT_NAME/package.json" \
  "$PROJECT_NAME/release-manifest.txt"; do
  grep -Fxq "$required_path" <<<"$CONTENTS" || {
    printf '发布包缺少：%s\n' "$required_path" >&2
    exit 1
  }
done

for forbidden_pattern in \
  "^${PROJECT_NAME//./\\.}/node_modules/" \
  '/.env' \
  '/.next/dev/' \
  '/.next/cache/' \
  '\.pem$' \
  '\.key$' \
  '/id_rsa$' \
  '/id_ed25519$' \
  '/\.\./'; do
  if grep -Eq "$forbidden_pattern" <<<"$CONTENTS"; then
    printf '发布包包含禁止路径：%s\n' "$forbidden_pattern" >&2
    exit 1
  fi
done

(cd "$OUTPUT_DIR" && shasum -a 256 -c "$(basename "$CHECKSUM_PATH")" >/dev/null)

printf '%s\n' 'standalone 发布包内容和校验文件验证通过'
