#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-standalone-package-test.XXXXXX")"
OUTPUT_DIR="$TEST_ROOT/output"
CREATED_NEXT=false
FIXTURE_PUBLIC_FILE="$PROJECT_ROOT/public/.standalone-package-test-fixture"

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
printf '%s\n' 'test static' > "$PROJECT_ROOT/.next/static/chunks/app.js"
printf '%s\n' 'test public' > "$FIXTURE_PUBLIC_FILE"

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
