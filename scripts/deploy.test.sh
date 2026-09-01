#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-deploy-test.XXXXXX")"
FAKE_BIN="$TEST_ROOT/bin"
PACKAGE_OUTPUT_DIR="$TEST_ROOT/package"
REMOTE_ROOT="$TEST_ROOT/remote"
DRY_REMOTE_ROOT="$TEST_ROOT/dry-run-remote"
DRY_RUN_OUTPUT="$TEST_ROOT/dry-run.out"
COMMAND_LOG="$TEST_ROOT/commands.log"
PM2_STATE_FILE="$TEST_ROOT/pm2-running"
ORIGINAL_PATH="$PATH"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  printf '部署脚本测试失败：%s\n' "$*" >&2
  exit 1
}

assert_file() {
  [[ -f "$1" ]] || fail "文件不存在：$1"
}

assert_not_file_or_link() {
  [[ ! -e "$1" && ! -L "$1" ]] || fail "文件或符号链接不应存在：$1"
}

assert_contains() {
  local expected="$1"
  local file="$2"
  grep -Fq "$expected" "$file" || fail "未在 $file 中找到：$expected"
}

assert_not_contains() {
  local forbidden="$1"
  local file="$2"
  if grep -Fq "$forbidden" "$file"; then
    fail "不应在 $file 中找到：$forbidden"
  fi
}

run_with_fake_tools() {
  PATH="$FAKE_BIN:$ORIGINAL_PATH" \
    DEPLOY_TEST_LOG="$COMMAND_LOG" \
    DEPLOY_PM2_STATE="$PM2_STATE_FILE" \
    DEPLOY_TEST_FORBID_SCP="${DEPLOY_TEST_FORBID_SCP:-false}" \
    DEPLOY_TEST_CURL_FAIL="${DEPLOY_TEST_CURL_FAIL:-false}" \
    "$@"
}

mkdir -p "$FAKE_BIN" "$PACKAGE_OUTPUT_DIR" "$REMOTE_ROOT" "$DRY_REMOTE_ROOT"

"$PROJECT_ROOT/scripts/package-deploy.sh" \
  --skip-checks \
  --output-dir "$PACKAGE_OUTPUT_DIR" >/dev/null 2>&1

archives=("$PACKAGE_OUTPUT_DIR/${PROJECT_NAME}-deploy-"*.tar.gz)
(( ${#archives[@]} == 1 )) || fail "测试需要唯一的发布包"
SOURCE_ARCHIVE="${archives[0]}"
SOURCE_CHECKSUM="$SOURCE_ARCHIVE.sha256"
assert_file "$SOURCE_ARCHIVE"
assert_file "$SOURCE_CHECKSUM"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'command_string=""' \
  'for argument in "$@"; do command_string="$argument"; done' \
  'printf "ssh %s\\n" "$command_string" >> "$DEPLOY_TEST_LOG"' \
  'bash -c "$command_string"' \
  > "$FAKE_BIN/ssh"
chmod +x "$FAKE_BIN/ssh"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  '[[ "$DEPLOY_TEST_FORBID_SCP" == true ]] && exit 91' \
  'previous_argument=""' \
  'last_argument=""' \
  'for argument in "$@"; do previous_argument="$last_argument"; last_argument="$argument"; done' \
  'printf "scp %s\\n" "$last_argument" >> "$DEPLOY_TEST_LOG"' \
  'cp "$previous_argument" "${last_argument#*:}"' \
  > "$FAKE_BIN/scp"
chmod +x "$FAKE_BIN/scp"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "npm %s\\n" "$*" >> "$DEPLOY_TEST_LOG"' \
  'exit 0' \
  > "$FAKE_BIN/npm"
chmod +x "$FAKE_BIN/npm"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "pm2 %s\\n" "$*" >> "$DEPLOY_TEST_LOG"' \
  'case "${1:-}" in' \
  '  describe) [[ -f "$DEPLOY_PM2_STATE" ]] ;;' \
  '  pid) [[ -f "$DEPLOY_PM2_STATE" ]] && printf "1234\\n" || printf "0\\n" ;;' \
  '  delete) rm -f "$DEPLOY_PM2_STATE" ;;' \
  '  start) : > "$DEPLOY_PM2_STATE" ;;' \
  '  save) ;;' \
  '  *) exit 2 ;;' \
  'esac' \
  > "$FAKE_BIN/pm2"
chmod +x "$FAKE_BIN/pm2"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "curl %s\\n" "$*" >> "$DEPLOY_TEST_LOG"' \
  '[[ "$DEPLOY_TEST_CURL_FAIL" == true ]] && exit 22' \
  'exit 0' \
  > "$FAKE_BIN/curl"
chmod +x "$FAKE_BIN/curl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'exit 0' \
  > "$FAKE_BIN/sleep"
chmod +x "$FAKE_BIN/sleep"

: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_FORBID_SCP=true \
  run_with_fake_tools \
  "$PROJECT_ROOT/scripts/deploy.sh" \
  --target deploy@example.invalid \
  --path "$DRY_REMOTE_ROOT" \
  --app-port 4567 \
  --dry-run \
  --skip-build \
  --skip-checks > "$DRY_RUN_OUTPUT" 2>&1
dry_run_status=$?
set -e
if (( dry_run_status != 0 )); then
  cat "$DRY_RUN_OUTPUT" >&2
  fail "dry-run 返回状态 $dry_run_status"
fi

assert_not_file_or_link "$DRY_REMOTE_ROOT/.deploy"
assert_contains "跳过远程目录创建和发布包上传" "$DRY_RUN_OUTPUT"
assert_not_contains "scp " "$COMMAND_LOG"
assert_contains "SSH connection established" "$COMMAND_LOG"

printf 'DATABASE_URL=mysql://test/test\n' > "$REMOTE_ROOT/.env"
: > "$COMMAND_LOG"
run_with_fake_tools \
  "$PROJECT_ROOT/scripts/deploy.sh" \
  --target deploy@example.invalid \
  --path "$REMOTE_ROOT" \
  --app-port 4567 \
  --skip-build \
  --skip-checks

CURRENT_TARGET="$(readlink "$REMOTE_ROOT/current")"
[[ "$CURRENT_TARGET" == "$REMOTE_ROOT/.deploy/releases/"* ]] || fail "current 未指向 release：$CURRENT_TARGET"
RELEASE_DIR="$CURRENT_TARGET"
assert_file "$RELEASE_DIR/package.json"
[[ -L "$RELEASE_DIR/.env" ]] || fail "release 未链接运行时 .env"
[[ "$(readlink "$RELEASE_DIR/.env")" == "$REMOTE_ROOT/.env" ]] || fail "release .env 链接目标错误"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_ARCHIVE")"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_CHECKSUM")"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/lock"
assert_file "$PM2_STATE_FILE"
assert_contains "npm ci --include=dev --no-audit --no-fund" "$COMMAND_LOG"
assert_contains "npm run build" "$COMMAND_LOG"
assert_contains "npm run db:deploy" "$COMMAND_LOG"
assert_contains "npm prune --omit=dev" "$COMMAND_LOG"
assert_contains "http://127.0.0.1:4567/api/health" "$COMMAND_LOG"

OLD_TARGET="$CURRENT_TARGET"
cp "$SOURCE_ARCHIVE" "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_ARCHIVE")"
cp "$SOURCE_CHECKSUM" "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_CHECKSUM")"
ln -sfn "$OLD_TARGET" "$REMOTE_ROOT/current"
: > "$PM2_STATE_FILE"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_CURL_FAIL=true \
  run_with_fake_tools \
  bash "$PROJECT_ROOT/scripts/remote-deploy.sh" \
  "$REMOTE_ROOT" \
  "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_ARCHIVE")" \
  "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_CHECKSUM")" \
  rollback-release \
  "$REMOTE_ROOT/.env" \
  school \
  4567 \
  5 \
  pm2 \
  npm \
  http://127.0.0.1:4567/api/health \
  false >/dev/null 2>&1
rollback_status=$?
set -e
(( rollback_status != 0 )) || fail "健康检查失败时远程部署不应成功"
[[ "$(readlink "$REMOTE_ROOT/current")" == "$OLD_TARGET" ]] || fail "健康检查失败后未恢复旧 release"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/releases/rollback-release"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/lock"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_ARCHIVE")"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_CHECKSUM")"
assert_file "$PM2_STATE_FILE"

echo "部署脚本测试通过"
