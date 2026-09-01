#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEMP_OUTPUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/school-package-test.XXXXXX")"
SECRET_FIXTURE_DIR="$PROJECT_ROOT/src/.package-deploy-test-secrets"
SECRET_FIXTURE_CREATED=false

cleanup() {
  rm -rf "$TEMP_OUTPUT_DIR"
  if [[ "$SECRET_FIXTURE_CREATED" == true ]]; then
    rm -rf "$SECRET_FIXTURE_DIR"
  fi
}
trap cleanup EXIT

[[ ! -e "$SECRET_FIXTURE_DIR" ]] || { echo "测试秘密文件目录已存在" >&2; exit 1; }
mkdir -p "$SECRET_FIXTURE_DIR/nested"
SECRET_FIXTURE_CREATED=true
touch \
  "$SECRET_FIXTURE_DIR/.env.production" \
  "$SECRET_FIXTURE_DIR/.npmrc" \
  "$SECRET_FIXTURE_DIR/private.pem" \
  "$SECRET_FIXTURE_DIR/certificate.p12" \
  "$SECRET_FIXTURE_DIR/nested/id_rsa" \
  "$SECRET_FIXTURE_DIR/nested/auth-secret.json" \
  "$SECRET_FIXTURE_DIR/nested/service-account-credentials.json" \
  "$SECRET_FIXTURE_DIR/nested/._metadata"

if "$PROJECT_ROOT/scripts/package-deploy.sh" --skip-checks --output-dir "$PROJECT_ROOT" >/dev/null 2>&1; then
  echo "脚本不应允许输出到项目根目录" >&2
  exit 1
fi

ln -s "$PROJECT_ROOT" "$TEMP_OUTPUT_DIR/project-root-link"
if "$PROJECT_ROOT/scripts/package-deploy.sh" --skip-checks --output-dir "$TEMP_OUTPUT_DIR/project-root-link" >/dev/null 2>&1; then
  echo "脚本不应允许通过符号链接输出到项目根目录" >&2
  exit 1
fi

"$PROJECT_ROOT/scripts/package-deploy.sh" --skip-checks --output-dir "$TEMP_OUTPUT_DIR" >/dev/null

archives=("$TEMP_OUTPUT_DIR"/school-deploy-*.tar.gz)
ARCHIVE_PATH="${archives[0]}"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"

[[ -f "$ARCHIVE_PATH" ]] || { echo "未生成发布压缩包" >&2; exit 1; }
[[ -f "$CHECKSUM_PATH" ]] || { echo "未生成 SHA-256 校验文件" >&2; exit 1; }

ARCHIVE_CONTENTS="$(tar -tzf "$ARCHIVE_PATH")"

for required_path in \
  "school/package.json" \
  "school/package-lock.json" \
  "school/src/app/layout.tsx" \
  "school/prisma/schema.prisma" \
  "school/prisma/migrations/20260901000000_init/migration.sql"; do
  if ! grep -Fxq "$required_path" <<<"$ARCHIVE_CONTENTS"; then
    echo "发布包缺少 $required_path" >&2
    exit 1
  fi
done

for forbidden_pattern in \
  '^school/\.env$' \
  '^school/\.env\.local$' \
  '^school/node_modules/' \
  '^school/\.next/' \
  '^school/releases/' \
  '^school/test-results/' \
  '^school/playwright-report/' \
  '^school/coverage/' \
  '/\.env[^/]*$' \
  '/\.npmrc$' \
  '\.pem$' \
  '\.p12$' \
  '/id_rsa$' \
  'secret[^/]*\.json$' \
  'credentials[^/]*\.json$' \
  '/\._[^/]*$'; do
  if grep -Eq "$forbidden_pattern" <<<"$ARCHIVE_CONTENTS"; then
    echo "发布包包含禁止路径：$forbidden_pattern" >&2
    exit 1
  fi
done

set +o pipefail
if gzip -dc "$ARCHIVE_PATH" | grep -aEiq 'LIBARCHIVE\.xattr|SCHILY\.xattr|com\.apple\.'; then
  set -o pipefail
  echo "发布包包含 macOS 扩展属性" >&2
  exit 1
fi
set -o pipefail

if command -v sha256sum >/dev/null 2>&1; then
  (cd "$TEMP_OUTPUT_DIR" && sha256sum -c "$(basename "$CHECKSUM_PATH")" >/dev/null)
else
  (cd "$TEMP_OUTPUT_DIR" && shasum -a 256 -c "$(basename "$CHECKSUM_PATH")" >/dev/null)
fi

echo "发布包内容和校验文件验证通过"
