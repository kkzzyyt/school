#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PROJECT_NAME="$(basename "$PROJECT_ROOT")"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-deploy-test.XXXXXX")"
TEST_ROOT="$(cd "$TEST_ROOT" && pwd -P)"
FAKE_BIN="$TEST_ROOT/bin"
PACKAGE_OUTPUT_DIR="$TEST_ROOT/package"
REMOTE_ROOT="$TEST_ROOT/remote"
DRY_REMOTE_ROOT="$TEST_ROOT/dry-run-remote"
DRY_RUN_OUTPUT="$TEST_ROOT/dry-run.out"
INVALID_PATH_OUTPUT="$TEST_ROOT/invalid-path.out"
COMMAND_LOG="$TEST_ROOT/commands.log"
SSH_OPTIONS_LOG="$TEST_ROOT/ssh-options.log"
PM2_STATE_FILE="$TEST_ROOT/pm2-running"
PM2_SIGNAL_ARCHIVE="$REMOTE_ROOT/.deploy/incoming/pm2-signal.tar.gz"
PM2_SIGNAL_CHECKSUM="$PM2_SIGNAL_ARCHIVE.sha256"
PM2_SIGNAL_OUTPUT="$TEST_ROOT/pm2-signal.out"
PM2_SIGNAL_ONCE_FILE="$TEST_ROOT/pm2-signal.once"
PM2_RESTORE_ARCHIVE="$REMOTE_ROOT/.deploy/incoming/pm2-restore-start.tar.gz"
PM2_RESTORE_CHECKSUM="$PM2_RESTORE_ARCHIVE.sha256"
PM2_RESTORE_OUTPUT="$TEST_ROOT/pm2-restore-start.out"
PM2_START_COUNT_FILE="$TEST_ROOT/pm2-start-count"
SYSTEMD_REMOTE_ROOT="$TEST_ROOT/systemd-remote"
SYSTEMD_APP_PATH="$SYSTEMD_REMOTE_ROOT/school"
SYSTEMD_RUNTIME_ENV="$SYSTEMD_REMOTE_ROOT/.deploy/runtime.env"
SYSTEMD_STATE_FILE="$TEST_ROOT/systemd-running"
KNOWN_HOSTS_FILE="$TEST_ROOT/known_hosts"
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
  grep -Fq -- "$expected" "$file" || fail "未在 $file 中找到：$expected"
}

assert_not_contains() {
  local forbidden="$1"
  local file="$2"
  if grep -Fq -- "$forbidden" "$file"; then
    fail "不应在 $file 中找到：$forbidden"
  fi
}

run_with_fake_tools() {
  PATH="$FAKE_BIN:$ORIGINAL_PATH" \
    DEPLOY_TEST_LOG="$COMMAND_LOG" \
    DEPLOY_TEST_SSH_OPTIONS_LOG="$SSH_OPTIONS_LOG" \
    DEPLOY_PM2_STATE="$PM2_STATE_FILE" \
    DEPLOY_SYSTEMD_STATE="$SYSTEMD_STATE_FILE" \
    DEPLOY_SYSTEMD_USER="$(id -un)" \
    DEPLOY_TEST_FORBID_SCP="${DEPLOY_TEST_FORBID_SCP:-false}" \
    DEPLOY_TEST_CURL_FAIL="${DEPLOY_TEST_CURL_FAIL:-false}" \
    DEPLOY_TEST_CURL_STATUS="${DEPLOY_TEST_CURL_STATUS:-200}" \
    "$@"
}

mkdir -p "$FAKE_BIN" "$PACKAGE_OUTPUT_DIR" "$REMOTE_ROOT" "$DRY_REMOTE_ROOT" "$SYSTEMD_REMOTE_ROOT/.deploy"
: > "$KNOWN_HOSTS_FILE"

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
  'printf "ssh" >> "$DEPLOY_TEST_SSH_OPTIONS_LOG"' \
  'printf " %q" "$@" >> "$DEPLOY_TEST_SSH_OPTIONS_LOG"' \
  'printf "\\n" >> "$DEPLOY_TEST_SSH_OPTIONS_LOG"' \
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
  'set -Eeuo pipefail' \
  'printf "npm %s\\n" "$*" >> "$DEPLOY_TEST_LOG"' \
  'if [[ "${1:-}" == run && "${2:-}" == build ]]; then mkdir -p .next; printf "remote-build\\n" > .next/BUILD_ID; fi' \
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
  '  start)' \
  '    if [[ -n "${DEPLOY_TEST_PM2_START_FAIL_ON_CALL:-}" ]]; then' \
  '      start_count=0' \
  '      if [[ -f "${DEPLOY_TEST_PM2_START_COUNT_FILE:?}" ]]; then start_count="$(cat "$DEPLOY_TEST_PM2_START_COUNT_FILE")"; fi' \
  '      start_count=$((start_count + 1))' \
  '      printf "%s\\n" "$start_count" > "$DEPLOY_TEST_PM2_START_COUNT_FILE"' \
  '      [[ "$start_count" == "$DEPLOY_TEST_PM2_START_FAIL_ON_CALL" ]] && exit 76' \
  '    fi' \
  '    : > "$DEPLOY_PM2_STATE"' \
  '    if [[ -n "${DEPLOY_TEST_PM2_SIGNAL_AFTER_START:-}" && ! -e "${DEPLOY_TEST_PM2_SIGNAL_ONCE_FILE:-}" ]]; then' \
  '      : > "${DEPLOY_TEST_PM2_SIGNAL_ONCE_FILE:?}"' \
  '      kill "-${DEPLOY_TEST_PM2_SIGNAL_AFTER_START}" "$PPID"' \
  '    fi' \
  '    ;;' \
  '  save) ;;' \
  '  *) exit 2 ;;' \
  'esac' \
  > "$FAKE_BIN/pm2"
chmod +x "$FAKE_BIN/pm2"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "systemctl %s\\n" "$*" >> "$DEPLOY_TEST_LOG"' \
  'case "${1:-}" in' \
  '  show)' \
  '    case " $* " in' \
  '      *" -p Group "*) id -gn ;;' \
  '      *" -p WorkingDirectory "*) printf "%s\\n" "${DEPLOY_SYSTEMD_WORKDIR:-}" ;;' \
  '      *) printf "%s\\n" "$DEPLOY_SYSTEMD_USER" ;;' \
  '    esac' \
  '    ;;' \
  '  is-active) [[ -f "$DEPLOY_SYSTEMD_STATE" ]] ;;' \
  '  stop) rm -f "$DEPLOY_SYSTEMD_STATE" ;;' \
  '  start) : > "$DEPLOY_SYSTEMD_STATE" ;;' \
  '  *) exit 2 ;;' \
  'esac' \
  > "$FAKE_BIN/systemctl"
chmod +x "$FAKE_BIN/systemctl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "curl %s\\n" "$*" >> "$DEPLOY_TEST_LOG"' \
  '[[ "$DEPLOY_TEST_CURL_FAIL" == true ]] && exit 22' \
  'printf "%s" "$DEPLOY_TEST_CURL_STATUS"' \
  'exit 0' \
  > "$FAKE_BIN/curl"
chmod +x "$FAKE_BIN/curl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'exit 0' \
  > "$FAKE_BIN/sleep"
chmod +x "$FAKE_BIN/sleep"

: > "$COMMAND_LOG"
: > "$SSH_OPTIONS_LOG"
set +e
run_with_fake_tools \
  "$PROJECT_ROOT/scripts/deploy.sh" \
  --target deploy@example.invalid \
  --known-hosts "$KNOWN_HOSTS_FILE" \
  --path "$DRY_REMOTE_ROOT//escaped" \
  --dry-run \
  --skip-checks > "$INVALID_PATH_OUTPUT" 2>&1
invalid_path_status=$?
set -e
(( invalid_path_status != 0 )) || fail "非规范 DEPLOY_PATH 不应通过验证"
assert_contains "DEPLOY_PATH 不能包含连续 /" "$INVALID_PATH_OUTPUT"

: > "$COMMAND_LOG"
: > "$SSH_OPTIONS_LOG"
set +e
DEPLOY_TEST_FORBID_SCP=true \
  run_with_fake_tools \
  "$PROJECT_ROOT/scripts/deploy.sh" \
  --target deploy@example.invalid \
  --known-hosts "$KNOWN_HOSTS_FILE" \
  --path "$DRY_REMOTE_ROOT" \
  --app-port 4567 \
  --dry-run \
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
assert_contains "StrictHostKeyChecking=yes" "$SSH_OPTIONS_LOG"
assert_contains "UserKnownHostsFile=$KNOWN_HOSTS_FILE" "$SSH_OPTIONS_LOG"
assert_contains "GlobalKnownHostsFile=/dev/null" "$SSH_OPTIONS_LOG"

printf 'DATABASE_URL=mysql://test/test\n' > "$REMOTE_ROOT/.env"
: > "$COMMAND_LOG"
: > "$SSH_OPTIONS_LOG"
run_with_fake_tools \
  "$PROJECT_ROOT/scripts/deploy.sh" \
  --target deploy@example.invalid \
  --known-hosts "$KNOWN_HOSTS_FILE" \
  --path "$REMOTE_ROOT" \
  --app-port 4567 \
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
assert_file "$RELEASE_DIR/.next/BUILD_ID"
assert_contains "npm ci --include=dev --no-audit --no-fund" "$COMMAND_LOG"
assert_contains "npm run build" "$COMMAND_LOG"
assert_contains "npm run db:deploy" "$COMMAND_LOG"
assert_contains "npm prune --omit=dev" "$COMMAND_LOG"
assert_contains "http://127.0.0.1:4567/api/health" "$COMMAND_LOG"
assert_contains "-- http://127.0.0.1:4567/api/health" "$COMMAND_LOG"

printf 'DATABASE_URL=mysql://test/test\n' > "$SYSTEMD_RUNTIME_ENV"
: > "$COMMAND_LOG"
: > "$SSH_OPTIONS_LOG"
DEPLOY_SYSTEMD_WORKDIR="$SYSTEMD_APP_PATH" \
  run_with_fake_tools \
  "$PROJECT_ROOT/scripts/deploy.sh" \
  --target deploy@example.invalid \
  --known-hosts "$KNOWN_HOSTS_FILE" \
  --path "$SYSTEMD_REMOTE_ROOT" \
  --runtime systemd \
  --service school-next.service \
  --app-port 4568 \
  --skip-checks

assert_file "$SYSTEMD_APP_PATH/.next/BUILD_ID"
[[ -L "$SYSTEMD_APP_PATH/.env" ]] || fail "systemd 默认运行时 .env 未链接"
[[ "$(readlink "$SYSTEMD_APP_PATH/.env")" == "$SYSTEMD_RUNTIME_ENV" ]] || fail "systemd 默认运行时 .env 路径错误"
assert_file "$SYSTEMD_STATE_FILE"
assert_contains "bash -s --" "$COMMAND_LOG"
assert_contains "$SYSTEMD_RUNTIME_ENV" "$COMMAND_LOG"
assert_contains "$SYSTEMD_APP_PATH" "$COMMAND_LOG"
assert_contains "systemctl start school-next.service" "$COMMAND_LOG"
assert_contains "npm run build" "$COMMAND_LOG"
assert_contains "http://127.0.0.1:4568/api/health" "$COMMAND_LOG"

OLD_TARGET="$CURRENT_TARGET"
cp "$SOURCE_ARCHIVE" "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_ARCHIVE")"
cp "$SOURCE_CHECKSUM" "$REMOTE_ROOT/.deploy/incoming/$(basename "$SOURCE_CHECKSUM")"
ln -sfn "$OLD_TARGET" "$REMOTE_ROOT/current"
: > "$PM2_STATE_FILE"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_CURL_STATUS=302 \
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

cp "$SOURCE_ARCHIVE" "$PM2_SIGNAL_ARCHIVE"
sha256sum "$PM2_SIGNAL_ARCHIVE" > "$PM2_SIGNAL_CHECKSUM"
: > "$PM2_STATE_FILE"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_PM2_SIGNAL_AFTER_START=TERM DEPLOY_TEST_PM2_SIGNAL_ONCE_FILE="$PM2_SIGNAL_ONCE_FILE" \
  run_with_fake_tools \
  bash "$PROJECT_ROOT/scripts/remote-deploy.sh" \
  "$REMOTE_ROOT" \
  "$PM2_SIGNAL_ARCHIVE" \
  "$PM2_SIGNAL_CHECKSUM" \
  pm2-signal-release \
  "$REMOTE_ROOT/.env" \
  school \
  4567 \
  5 \
  pm2 \
  npm \
  http://127.0.0.1:4567/api/health \
  false > "$PM2_SIGNAL_OUTPUT" 2>&1
pm2_signal_status=$?
set -e
(( pm2_signal_status == 143 )) || fail "PM2 TERM 中断应以 143 退出，实际为 $pm2_signal_status"
[[ -f "$PM2_SIGNAL_ONCE_FILE" ]] || fail "未向受测 PM2 远端 shell 发送 TERM"
assert_contains "收到 TERM 信号" "$PM2_SIGNAL_OUTPUT"
[[ "$(readlink "$REMOTE_ROOT/current")" == "$OLD_TARGET" ]] || fail "PM2 TERM 中断后未恢复旧 release"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/releases/pm2-signal-release"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/lock"
assert_not_file_or_link "$PM2_SIGNAL_ARCHIVE"
assert_not_file_or_link "$PM2_SIGNAL_CHECKSUM"
assert_file "$PM2_STATE_FILE"

cp "$SOURCE_ARCHIVE" "$PM2_RESTORE_ARCHIVE"
sha256sum "$PM2_RESTORE_ARCHIVE" > "$PM2_RESTORE_CHECKSUM"
: > "$PM2_STATE_FILE"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_CURL_STATUS=302 DEPLOY_TEST_PM2_START_FAIL_ON_CALL=2 DEPLOY_TEST_PM2_START_COUNT_FILE="$PM2_START_COUNT_FILE" \
  run_with_fake_tools \
  bash "$PROJECT_ROOT/scripts/remote-deploy.sh" \
  "$REMOTE_ROOT" \
  "$PM2_RESTORE_ARCHIVE" \
  "$PM2_RESTORE_CHECKSUM" \
  pm2-restore-start-failure \
  "$REMOTE_ROOT/.env" \
  school \
  4567 \
  5 \
  pm2 \
  npm \
  http://127.0.0.1:4567/api/health \
  false > "$PM2_RESTORE_OUTPUT" 2>&1
pm2_restore_status=$?
set -e
(( pm2_restore_status != 0 )) || fail "PM2 恢复启动失败时部署不应成功"
assert_contains "无法启动旧 PM2 进程" "$PM2_RESTORE_OUTPUT"
assert_contains "恢复不完整" "$PM2_RESTORE_OUTPUT"
[[ "$(readlink "$REMOTE_ROOT/current")" == "$OLD_TARGET" ]] || fail "PM2 恢复启动失败后未切回旧 release"
[[ -d "$REMOTE_ROOT/.deploy/releases/pm2-restore-start-failure" ]] || fail "PM2 恢复不完整时新 release 不应删除"
assert_not_file_or_link "$REMOTE_ROOT/.deploy/lock"
assert_not_file_or_link "$PM2_RESTORE_ARCHIVE"
assert_not_file_or_link "$PM2_RESTORE_CHECKSUM"
assert_not_file_or_link "$PM2_STATE_FILE"

echo "部署脚本测试通过"
