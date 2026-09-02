#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-systemd-deploy-test.XXXXXX")"
TEST_ROOT="$(cd "$TEST_ROOT" && pwd -P)"
FAKE_BIN="$TEST_ROOT/bin"
REMOTE_ROOT="$TEST_ROOT/remote"
APP_PATH="$REMOTE_ROOT/school"
LOGICAL_WORKDIR="$REMOTE_ROOT/logical-school"
INCOMING_DIR="$REMOTE_ROOT/.deploy/incoming"
RUNTIME_ENV="$REMOTE_ROOT/.deploy/runtime.env"
ARCHIVE_SOURCE="$TEST_ROOT/archive-source/school"
RELEASE_DIR="$REMOTE_ROOT/.deploy/releases/test-release"
ROLLBACK_DIR="$REMOTE_ROOT/.deploy/rollback-test-release"
COMMAND_LOG="$TEST_ROOT/commands.log"
SERVICE_STATE="$TEST_ROOT/service-running"
INVALID_OUTPUT="$TEST_ROOT/invalid-arguments.out"
MISMATCH_ARCHIVE="$INCOMING_DIR/school-working-directory.tar.gz"
MISMATCH_CHECKSUM="$MISMATCH_ARCHIVE.sha256"
FAILURE_ARCHIVE="$INCOMING_DIR/school-healthcheck-failure.tar.gz"
FAILURE_CHECKSUM="$FAILURE_ARCHIVE.sha256"
FAILURE_OUTPUT="$TEST_ROOT/healthcheck-failure.out"
SKIP_ARCHIVE="$INCOMING_DIR/school-skip-migrations.tar.gz"
SKIP_CHECKSUM="$SKIP_ARCHIVE.sha256"
SKIP_RELEASE_DIR="$REMOTE_ROOT/.deploy/releases/skip-migrations-release"
SKIP_ROLLBACK_DIR="$REMOTE_ROOT/.deploy/rollback-skip-migrations-release"
STOP_FAILURE_ARCHIVE="$INCOMING_DIR/school-stop-failure.tar.gz"
STOP_FAILURE_CHECKSUM="$STOP_FAILURE_ARCHIVE.sha256"
STOP_FAILURE_OUTPUT="$TEST_ROOT/stop-failure.out"
STOP_FAILURE_ONCE_FILE="$TEST_ROOT/stop-failure.once"
SIGNAL_ARCHIVE="$INCOMING_DIR/school-term-interruption.tar.gz"
SIGNAL_CHECKSUM="$SIGNAL_ARCHIVE.sha256"
SIGNAL_OUTPUT="$TEST_ROOT/term-interruption.out"
SIGNAL_ONCE_FILE="$TEST_ROOT/term-interruption.once"
RESTORE_MOVE_ARCHIVE="$INCOMING_DIR/school-restore-move-failure.tar.gz"
RESTORE_MOVE_CHECKSUM="$RESTORE_MOVE_ARCHIVE.sha256"
RESTORE_MOVE_OUTPUT="$TEST_ROOT/restore-move-failure.out"
RESTORE_MOVE_ONCE_FILE="$TEST_ROOT/restore-move-failure.once"
RESTORE_START_ARCHIVE="$INCOMING_DIR/school-restore-start-failure.tar.gz"
RESTORE_START_CHECKSUM="$RESTORE_START_ARCHIVE.sha256"
RESTORE_START_OUTPUT="$TEST_ROOT/restore-start-failure.out"
RESTORE_START_COUNT_FILE="$TEST_ROOT/restore-start-count"
SYMLINK_ESCAPE_ROOT="$TEST_ROOT/symlink-escape"
SYMLINK_DEPLOY_ROOT="$TEST_ROOT/deploy-root-link"
SYMLINK_BOOTSTRAP_APP="$REMOTE_ROOT/bootstrap-school"
SYMLINK_ARCHIVE="$INCOMING_DIR/school-symlink-root.tar.gz"
SYMLINK_CHECKSUM="$SYMLINK_ARCHIVE.sha256"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'systemd 部署脚本测试失败：%s\n' "$*" >&2
  exit 1
}

assert_contains() {
  local expected="$1"
  local file="$2"

  if ! grep -Fq -- "$expected" "$file"; then
    cat "$file" >&2
    fail "未在 $file 中找到：$expected"
  fi
}

assert_not_contains() {
  local forbidden="$1"
  local file="$2"

  if grep -Fq -- "$forbidden" "$file"; then
    fail "不应在 $file 中找到：$forbidden"
  fi
}

assert_before() {
  local first="$1"
  local second="$2"
  local first_line
  local second_line

  first_line="$(grep -nF "$first" "$COMMAND_LOG" | head -n 1 | cut -d: -f1 || true)"
  second_line="$(grep -nF "$second" "$COMMAND_LOG" | head -n 1 | cut -d: -f1 || true)"
  [[ -n "$first_line" ]] || fail "未记录命令：$first"
  [[ -n "$second_line" ]] || fail "未记录命令：$second"
  (( first_line < second_line )) || fail "命令顺序错误：$first 应在 $second 之前"
}

mkdir -p \
  "$FAKE_BIN" \
  "$APP_PATH/node_modules/next/dist/bin" \
  "$INCOMING_DIR" \
  "$ARCHIVE_SOURCE/prisma/migrations/20260901000000_init" \
  "$SYMLINK_ESCAPE_ROOT" \
  "$REMOTE_ROOT/.deploy/rollback-0001" \
  "$REMOTE_ROOT/.deploy/rollback-0002"
printf '#!/usr/bin/env node\n' > "$APP_PATH/node_modules/next/dist/bin/next"
chmod +x "$APP_PATH/node_modules/next/dist/bin/next"
printf 'old-dependency\n' > "$APP_PATH/node_modules/dependency-marker"
printf 'DATABASE_URL=mysql://school:test@127.0.0.1:3306/school\n' > "$RUNTIME_ENV"
printf 'legacy-runtime-env\n' > "$APP_PATH/.env"
printf 'old\n' > "$APP_PATH/old.txt"
ln -s "$APP_PATH" "$LOGICAL_WORKDIR"
printf '{"name":"school"}\n' > "$ARCHIVE_SOURCE/package.json"
printf '{}\n' > "$ARCHIVE_SOURCE/package-lock.json"
printf 'export default {};\n' > "$ARCHIVE_SOURCE/next.config.ts"
printf '{"compilerOptions":{}}\n' > "$ARCHIVE_SOURCE/tsconfig.json"
printf 'export default {};\n' > "$ARCHIVE_SOURCE/prisma.config.ts"
printf 'migration\n' > "$ARCHIVE_SOURCE/prisma/migrations/20260901000000_init/migration.sql"
printf 'DATABASE_URL=mysql://escape/test\n' > "$SYMLINK_ESCAPE_ROOT/runtime.env"
tar -czf "$INCOMING_DIR/school-deploy-test.tar.gz" -C "$TEST_ROOT/archive-source" school
sha256sum "$INCOMING_DIR/school-deploy-test.tar.gz" > "$INCOMING_DIR/school-deploy-test.tar.gz.sha256"
cp "$INCOMING_DIR/school-deploy-test.tar.gz" "$MISMATCH_ARCHIVE"
sha256sum "$MISMATCH_ARCHIVE" > "$MISMATCH_CHECKSUM"
cp "$INCOMING_DIR/school-deploy-test.tar.gz" "$SYMLINK_ARCHIVE"
sha256sum "$SYMLINK_ARCHIVE" > "$SYMLINK_CHECKSUM"
ln -s "$REMOTE_ROOT" "$SYMLINK_DEPLOY_ROOT"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "systemctl %s\\n" "$*" >> "$COMMAND_LOG"' \
  'case "${1:-}" in' \
  '  show)' \
  '    case " $* " in' \
  '      *" -p Group "*) id -gn ;;' \
  '      *" -p WorkingDirectory "*) printf "%s\\n" "${DEPLOY_SERVICE_WORKDIR:-}" ;;' \
  '      *) printf "%s\\n" "${DEPLOY_SERVICE_USER:-root}" ;;' \
  '    esac' \
  '    ;;' \
  '  is-active) [[ -f "$SERVICE_STATE" ]] ;;' \
  '  stop)' \
  '    rm -f "$SERVICE_STATE"' \
  '    if [[ "${DEPLOY_TEST_STOP_FAIL_AFTER_STOP:-false}" == true && ! -e "${DEPLOY_TEST_STOP_FAIL_ONCE_FILE:-}" ]]; then' \
  '      : > "${DEPLOY_TEST_STOP_FAIL_ONCE_FILE:?}"' \
  '      exit 75' \
  '    fi' \
  '    if [[ -n "${DEPLOY_TEST_SIGNAL_AFTER_STOP:-}" && ! -e "${DEPLOY_TEST_SIGNAL_ONCE_FILE:-}" ]]; then' \
  '      : > "${DEPLOY_TEST_SIGNAL_ONCE_FILE:?}"' \
  '      kill "-${DEPLOY_TEST_SIGNAL_AFTER_STOP}" "$PPID"' \
  '    fi' \
  '    ;;' \
  '  start)' \
  '    if [[ -n "${DEPLOY_TEST_START_FAIL_ON_CALL:-}" ]]; then' \
  '      start_count=0' \
  '      if [[ -f "${DEPLOY_TEST_START_COUNT_FILE:?}" ]]; then start_count="$(cat "$DEPLOY_TEST_START_COUNT_FILE")"; fi' \
  '      start_count=$((start_count + 1))' \
  '      printf "%s\\n" "$start_count" > "$DEPLOY_TEST_START_COUNT_FILE"' \
  '      [[ "$start_count" == "$DEPLOY_TEST_START_FAIL_ON_CALL" ]] && exit 76' \
  '    fi' \
  '    : > "$SERVICE_STATE"' \
  '    ;;' \
  '  *) exit 2 ;;' \
  'esac' \
  > "$FAKE_BIN/systemctl"
chmod +x "$FAKE_BIN/systemctl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'if [[ "${DEPLOY_TEST_FAIL_MV_SOURCE:-}" == "${1:-}" && "${DEPLOY_TEST_FAIL_MV_DEST:-}" == "${2:-}" && ! -e "${DEPLOY_TEST_FAIL_MV_ONCE_FILE:-}" ]]; then' \
  '  : > "${DEPLOY_TEST_FAIL_MV_ONCE_FILE:?}"' \
  '  exit 77' \
  'fi' \
  'exec /bin/mv "$@"' \
  > "$FAKE_BIN/mv"
chmod +x "$FAKE_BIN/mv"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'set -Eeuo pipefail' \
  'printf "npm cwd=%s args=%s\\n" "$PWD" "$*" >> "$COMMAND_LOG"' \
  'case "${1:-}" in' \
  '  ci)' \
  '    mkdir -p node_modules/next/dist/bin' \
  '    printf "#!/usr/bin/env node\\n" > node_modules/next/dist/bin/next' \
  '    chmod +x node_modules/next/dist/bin/next' \
  '    printf "new-dependency\\n" > node_modules/dependency-marker' \
  '    ;;' \
  '  run)' \
  '    if [[ "${2:-}" == build ]]; then mkdir -p .next; printf "new-build\\n" > .next/BUILD_ID; fi' \
  '    ;;' \
  '  prune) ;;' \
  '  *) exit 2 ;;' \
  'esac' \
  > "$FAKE_BIN/npm"
chmod +x "$FAKE_BIN/npm"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'printf "curl %s\\n" "$*" >> "$COMMAND_LOG"' \
  '[[ "${DEPLOY_TEST_CURL_FAIL:-false}" == true ]] && exit 22' \
  'printf "%s" "${DEPLOY_TEST_CURL_STATUS:-200}"' \
  'exit 0' \
  > "$FAKE_BIN/curl"
chmod +x "$FAKE_BIN/curl"

printf '%s\n' \
  '#!/usr/bin/env bash' \
  'exit 0' \
  > "$FAKE_BIN/sleep"
chmod +x "$FAKE_BIN/sleep"

: > "$SERVICE_STATE"
: > "$COMMAND_LOG"

PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$SYMLINK_BOOTSTRAP_APP" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$SYMLINK_DEPLOY_ROOT" \
  "$SYMLINK_DEPLOY_ROOT/.deploy/incoming/$(basename "$SYMLINK_ARCHIVE")" \
  "$SYMLINK_DEPLOY_ROOT/.deploy/incoming/$(basename "$SYMLINK_CHECKSUM")" \
  symlink-root-bootstrap \
  "$SYMLINK_DEPLOY_ROOT/.deploy/runtime.env" \
  school-next.service \
  "$SYMLINK_DEPLOY_ROOT/bootstrap-school" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false
[[ -f "$SYMLINK_BOOTSTRAP_APP/.next/BUILD_ID" ]] || fail "符号链接部署目录未解析到物理初始应用目录"
[[ -L "$SYMLINK_BOOTSTRAP_APP/.env" ]] || fail "符号链接部署目录的运行时 .env 未链接"
[[ "$(readlink "$SYMLINK_BOOTSTRAP_APP/.env")" == "$RUNTIME_ENV" ]] || fail "符号链接部署目录的运行时 .env 未解析为物理路径"
[[ ! -e "$SYMLINK_ARCHIVE" && ! -e "$SYMLINK_CHECKSUM" ]] || fail "符号链接部署目录发布后归档未清理"
rm -rf "$SYMLINK_BOOTSTRAP_APP"
: > "$COMMAND_LOG"

set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  invalid-npm \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$TEST_ROOT/missing-npm" \
  false > "$INVALID_OUTPUT" 2>&1
invalid_npm_status=$?
set -e
(( invalid_npm_status != 0 )) || fail "不存在的 NPM_BIN 不应通过验证"
assert_contains "npm 不可执行" "$INVALID_OUTPUT"

set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  invalid-relative-npm \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  1 \
  ./npm \
  false > "$INVALID_OUTPUT" 2>&1
invalid_relative_npm_status=$?
set -e
(( invalid_relative_npm_status != 0 )) || fail "相对 NPM_BIN 不应通过验证"
assert_contains "npm 路径必须是绝对路径" "$INVALID_OUTPUT"

set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  invalid-double-slash \
  "$RUNTIME_ENV" \
  school-next.service \
  "$REMOTE_ROOT//.deploy/app" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false > "$INVALID_OUTPUT" 2>&1
invalid_double_slash_status=$?
set -e
(( invalid_double_slash_status != 0 )) || fail "含连续 / 的应用目录不应通过验证"
assert_contains "应用目录 不能包含连续 /" "$INVALID_OUTPUT"

set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  invalid-trailing-slash \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH/" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false > "$INVALID_OUTPUT" 2>&1
invalid_trailing_slash_status=$?
set -e
(( invalid_trailing_slash_status != 0 )) || fail "尾随 / 的应用目录不应通过验证"
assert_contains "应用目录 不能以 / 结尾" "$INVALID_OUTPUT"

ln -s "$SYMLINK_ESCAPE_ROOT" "$REMOTE_ROOT/escaped-parent"
set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  escaped-app-parent \
  "$RUNTIME_ENV" \
  school-next.service \
  "$REMOTE_ROOT/escaped-parent/school" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false > "$INVALID_OUTPUT" 2>&1
escaped_app_parent_status=$?
set -e
(( escaped_app_parent_status != 0 )) || fail "经符号链接逃逸的应用目录不应通过验证"
assert_contains "应用目录的物理路径必须位于部署目录内" "$INVALID_OUTPUT"

ln -s "$SYMLINK_ESCAPE_ROOT/runtime.env" "$REMOTE_ROOT/.deploy/escaped-runtime.env"
set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  escaped-env-file \
  "$REMOTE_ROOT/.deploy/escaped-runtime.env" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false > "$INVALID_OUTPUT" 2>&1
escaped_env_file_status=$?
set -e
(( escaped_env_file_status != 0 )) || fail "经符号链接逃逸的运行时 .env 不应通过验证"
assert_contains "运行时 .env 的物理路径必须位于部署目录内" "$INVALID_OUTPUT"

set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  invalid-migrations \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  invalid > "$INVALID_OUTPUT" 2>&1
invalid_migrations_status=$?
set -e
(( invalid_migrations_status != 0 )) || fail "非法 SKIP_MIGRATIONS 不应通过验证"
assert_contains "迁移开关非法" "$INVALID_OUTPUT"

set +e
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$REMOTE_ROOT/not-school" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$MISMATCH_ARCHIVE" \
  "$MISMATCH_CHECKSUM" \
  invalid-working-directory \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false > "$INVALID_OUTPUT" 2>&1
invalid_working_directory_status=$?
set -e
(( invalid_working_directory_status != 0 )) || fail "不匹配的 WorkingDirectory 不应通过验证"
assert_contains "WorkingDirectory 必须为 $APP_PATH" "$INVALID_OUTPUT"
[[ ! -e "$MISMATCH_ARCHIVE" ]] || fail "工作目录校验失败后发布包未清理"
[[ ! -e "$MISMATCH_CHECKSUM" ]] || fail "工作目录校验失败后校验文件未清理"

PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$LOGICAL_WORKDIR" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$INCOMING_DIR/school-deploy-test.tar.gz" \
  "$INCOMING_DIR/school-deploy-test.tar.gz.sha256" \
  test-release \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false

[[ -f "$APP_PATH/.next/BUILD_ID" ]] || fail "远端生产构建未生成"
[[ "$(cat "$APP_PATH/.next/BUILD_ID")" == "new-build" ]] || fail "发布内容不是远端构建产物"
[[ -x "$APP_PATH/node_modules/next/dist/bin/next" ]] || fail "新 release 未安装运行时依赖"
[[ "$(cat "$APP_PATH/node_modules/dependency-marker")" == "new-dependency" ]] || fail "新 release 未使用自己的 node_modules"
[[ -L "$APP_PATH/.env" ]] || fail "新应用未链接稳定运行时 .env"
[[ "$(readlink "$APP_PATH/.env")" == "$RUNTIME_ENV" ]] || fail "新应用 .env 链接目标错误"
[[ -f "$RUNTIME_ENV" ]] || fail "运行时 .env 未保留"
[[ -f "$ROLLBACK_DIR/old.txt" ]] || fail "旧应用未保留为回滚目录"
[[ "$(cat "$ROLLBACK_DIR/node_modules/dependency-marker")" == "old-dependency" ]] || fail "旧应用 node_modules 未保留用于回滚"
[[ ! -e "$REMOTE_ROOT/.deploy/lock" ]] || fail "部署锁未清理"
[[ ! -e "$INCOMING_DIR/school-deploy-test.tar.gz" ]] || fail "发布包未清理"
[[ -d "$ROLLBACK_DIR" ]] || fail "当前版本回滚目录未保留"
[[ ! -e "$REMOTE_ROOT/.deploy/rollback-0001" ]] || fail "旧回滚目录未按数量清理"
[[ ! -e "$REMOTE_ROOT/.deploy/rollback-0002" ]] || fail "旧回滚目录未按数量清理"

assert_contains "npm cwd=$RELEASE_DIR args=ci --include=dev --no-audit --no-fund" "$COMMAND_LOG"
assert_contains "npm cwd=$RELEASE_DIR args=run build" "$COMMAND_LOG"
assert_contains "npm cwd=$RELEASE_DIR args=run db:deploy" "$COMMAND_LOG"
assert_contains "npm cwd=$RELEASE_DIR args=prune --omit=dev" "$COMMAND_LOG"
assert_not_contains "npm cwd=$APP_PATH" "$COMMAND_LOG"
assert_before "npm cwd=$RELEASE_DIR args=ci --include=dev --no-audit --no-fund" "npm cwd=$RELEASE_DIR args=run build"
assert_before "npm cwd=$RELEASE_DIR args=run build" "npm cwd=$RELEASE_DIR args=run db:deploy"
assert_before "npm cwd=$RELEASE_DIR args=run db:deploy" "npm cwd=$RELEASE_DIR args=prune --omit=dev"
assert_before "npm cwd=$RELEASE_DIR args=prune --omit=dev" "systemctl stop school-next.service"
assert_contains "systemctl start school-next.service" "$COMMAND_LOG"
assert_contains "curl -fsS" "$COMMAND_LOG"

printf 'working-release\n' > "$APP_PATH/release-marker"
tar -czf "$FAILURE_ARCHIVE" -C "$TEST_ROOT/archive-source" school
sha256sum "$FAILURE_ARCHIVE" > "$FAILURE_CHECKSUM"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_CURL_STATUS=302 PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$APP_PATH" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$FAILURE_ARCHIVE" \
  "$FAILURE_CHECKSUM" \
  healthcheck-failure \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  1 \
  "$FAKE_BIN/npm" \
  false > "$FAILURE_OUTPUT" 2>&1
healthcheck_failure_status=$?
set -e
(( healthcheck_failure_status != 0 )) || fail "健康检查失败时 systemd 部署不应成功"
assert_contains "健康检查失败" "$FAILURE_OUTPUT"
assert_contains "-- http://127.0.0.1:3000/api/health" "$COMMAND_LOG"
[[ "$(cat "$APP_PATH/release-marker")" == "working-release" ]] || fail "健康检查失败后未恢复旧应用"
[[ "$(cat "$APP_PATH/node_modules/dependency-marker")" == "new-dependency" ]] || fail "健康检查失败后未恢复旧依赖"
[[ -f "$SERVICE_STATE" ]] || fail "健康检查失败后未重新启动旧服务"
[[ ! -e "$REMOTE_ROOT/.deploy/rollback-healthcheck-failure" ]] || fail "失败 release 的回滚目录不应保留"
[[ ! -e "$REMOTE_ROOT/.deploy/failed-healthcheck-failure" ]] || fail "失败 release 目录未清理"
[[ ! -e "$FAILURE_ARCHIVE" && ! -e "$FAILURE_CHECKSUM" ]] || fail "健康检查失败后发布包未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/lock" ]] || fail "健康检查失败后部署锁未清理"

tar -czf "$SKIP_ARCHIVE" -C "$TEST_ROOT/archive-source" school
sha256sum "$SKIP_ARCHIVE" > "$SKIP_CHECKSUM"
: > "$COMMAND_LOG"
PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$APP_PATH" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$SKIP_ARCHIVE" \
  "$SKIP_CHECKSUM" \
  skip-migrations-release \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  2 \
  "$FAKE_BIN/npm" \
  true
assert_contains "npm cwd=$SKIP_RELEASE_DIR args=ci --include=dev --no-audit --no-fund" "$COMMAND_LOG"
assert_contains "npm cwd=$SKIP_RELEASE_DIR args=run build" "$COMMAND_LOG"
assert_not_contains "npm cwd=$SKIP_RELEASE_DIR args=run db:deploy" "$COMMAND_LOG"
assert_contains "npm cwd=$SKIP_RELEASE_DIR args=prune --omit=dev" "$COMMAND_LOG"
[[ -f "$SKIP_ROLLBACK_DIR/release-marker" ]] || fail "跳过迁移发布未保留上一个可回滚版本"
[[ ! -e "$SKIP_ARCHIVE" && ! -e "$SKIP_CHECKSUM" ]] || fail "跳过迁移发布后发布包未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/lock" ]] || fail "跳过迁移发布后部署锁未清理"

printf 'before-stop-failure\n' > "$APP_PATH/release-marker"
tar -czf "$STOP_FAILURE_ARCHIVE" -C "$TEST_ROOT/archive-source" school
sha256sum "$STOP_FAILURE_ARCHIVE" > "$STOP_FAILURE_CHECKSUM"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_STOP_FAIL_AFTER_STOP=true DEPLOY_TEST_STOP_FAIL_ONCE_FILE="$STOP_FAILURE_ONCE_FILE" PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$APP_PATH" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$STOP_FAILURE_ARCHIVE" \
  "$STOP_FAILURE_CHECKSUM" \
  stop-failure \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  3 \
  "$FAKE_BIN/npm" \
  false > "$STOP_FAILURE_OUTPUT" 2>&1
stop_failure_status=$?
set -e
(( stop_failure_status != 0 )) || fail "stop 后失败的部署不应成功"
[[ -f "$STOP_FAILURE_ONCE_FILE" ]] || fail "未模拟 stop 后失败"
[[ "$(cat "$APP_PATH/release-marker")" == "before-stop-failure" ]] || fail "stop 失败后未保留旧应用"
[[ "$(cat "$APP_PATH/node_modules/dependency-marker")" == "new-dependency" ]] || fail "stop 失败后未保留旧依赖"
[[ -f "$SERVICE_STATE" ]] || fail "stop 失败后未恢复旧服务"
[[ ! -e "$REMOTE_ROOT/.deploy/releases/stop-failure" ]] || fail "stop 失败后的 staging release 未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/rollback-stop-failure" ]] || fail "stop 失败时不应创建回滚目录"
[[ ! -e "$STOP_FAILURE_ARCHIVE" && ! -e "$STOP_FAILURE_CHECKSUM" ]] || fail "stop 失败后发布包未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/lock" ]] || fail "stop 失败后部署锁未清理"

printf 'before-term-interruption\n' > "$APP_PATH/release-marker"
tar -czf "$SIGNAL_ARCHIVE" -C "$TEST_ROOT/archive-source" school
sha256sum "$SIGNAL_ARCHIVE" > "$SIGNAL_CHECKSUM"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_SIGNAL_AFTER_STOP=TERM DEPLOY_TEST_SIGNAL_ONCE_FILE="$SIGNAL_ONCE_FILE" PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$APP_PATH" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$SIGNAL_ARCHIVE" \
  "$SIGNAL_CHECKSUM" \
  term-interruption \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  3 \
  "$FAKE_BIN/npm" \
  false > "$SIGNAL_OUTPUT" 2>&1
signal_status=$?
set -e
(( signal_status == 143 )) || fail "TERM 中断应以 143 退出，实际为 $signal_status"
[[ -f "$SIGNAL_ONCE_FILE" ]] || fail "未向受测远端 shell 发送 TERM"
assert_contains "收到 TERM 信号" "$SIGNAL_OUTPUT"
[[ "$(cat "$APP_PATH/release-marker")" == "before-term-interruption" ]] || fail "TERM 中断后未保留旧应用"
[[ "$(cat "$APP_PATH/node_modules/dependency-marker")" == "new-dependency" ]] || fail "TERM 中断后未保留旧依赖"
[[ -f "$SERVICE_STATE" ]] || fail "TERM 中断后未恢复旧服务"
[[ ! -e "$REMOTE_ROOT/.deploy/releases/term-interruption" ]] || fail "TERM 中断后的 staging release 未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/rollback-term-interruption" ]] || fail "TERM 中断时不应创建回滚目录"
[[ ! -e "$SIGNAL_ARCHIVE" && ! -e "$SIGNAL_CHECKSUM" ]] || fail "TERM 中断后发布包未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/lock" ]] || fail "TERM 中断后部署锁未清理"

printf 'before-restore-start-failure\n' > "$APP_PATH/release-marker"
tar -czf "$RESTORE_START_ARCHIVE" -C "$TEST_ROOT/archive-source" school
sha256sum "$RESTORE_START_ARCHIVE" > "$RESTORE_START_CHECKSUM"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_CURL_STATUS=302 DEPLOY_TEST_START_FAIL_ON_CALL=2 DEPLOY_TEST_START_COUNT_FILE="$RESTORE_START_COUNT_FILE" PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$APP_PATH" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$RESTORE_START_ARCHIVE" \
  "$RESTORE_START_CHECKSUM" \
  restore-start-failure \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  3 \
  "$FAKE_BIN/npm" \
  false > "$RESTORE_START_OUTPUT" 2>&1
restore_start_status=$?
set -e
(( restore_start_status != 0 )) || fail "恢复旧服务启动失败时部署不应成功"
assert_contains "无法启动已恢复的服务" "$RESTORE_START_OUTPUT"
[[ "$(cat "$APP_PATH/release-marker")" == "before-restore-start-failure" ]] || fail "服务启动恢复失败后旧应用未回到应用目录"
[[ -d "$REMOTE_ROOT/.deploy/failed-restore-start-failure" ]] || fail "服务启动恢复失败后失败目录不应删除"
[[ ! -e "$REMOTE_ROOT/.deploy/rollback-restore-start-failure" ]] || fail "成功移回的回滚目录不应残留"
[[ ! -e "$SERVICE_STATE" ]] || fail "服务启动恢复失败后不应报告服务仍在运行"
[[ ! -e "$RESTORE_START_ARCHIVE" && ! -e "$RESTORE_START_CHECKSUM" ]] || fail "服务启动恢复失败后发布包未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/lock" ]] || fail "服务启动恢复失败后部署锁未清理"

rm -rf "$REMOTE_ROOT/.deploy/failed-restore-start-failure"
: > "$SERVICE_STATE"
printf 'before-restore-move-failure\n' > "$APP_PATH/release-marker"
tar -czf "$RESTORE_MOVE_ARCHIVE" -C "$TEST_ROOT/archive-source" school
sha256sum "$RESTORE_MOVE_ARCHIVE" > "$RESTORE_MOVE_CHECKSUM"
: > "$COMMAND_LOG"
set +e
DEPLOY_TEST_CURL_STATUS=302 DEPLOY_TEST_FAIL_MV_SOURCE="$REMOTE_ROOT/.deploy/rollback-restore-move-failure" DEPLOY_TEST_FAIL_MV_DEST="$APP_PATH" DEPLOY_TEST_FAIL_MV_ONCE_FILE="$RESTORE_MOVE_ONCE_FILE" PATH="$FAKE_BIN:$PATH" COMMAND_LOG="$COMMAND_LOG" SERVICE_STATE="$SERVICE_STATE" DEPLOY_SERVICE_USER="$(id -un)" DEPLOY_SERVICE_WORKDIR="$APP_PATH" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-systemd.sh" \
  "$REMOTE_ROOT" \
  "$RESTORE_MOVE_ARCHIVE" \
  "$RESTORE_MOVE_CHECKSUM" \
  restore-move-failure \
  "$RUNTIME_ENV" \
  school-next.service \
  "$APP_PATH" \
  http://127.0.0.1:3000/api/health \
  3 \
  "$FAKE_BIN/npm" \
  false > "$RESTORE_MOVE_OUTPUT" 2>&1
restore_move_status=$?
set -e
(( restore_move_status != 0 )) || fail "恢复目录移动失败时部署不应成功"
[[ -f "$RESTORE_MOVE_ONCE_FILE" ]] || fail "未模拟恢复目录移动失败"
assert_contains "无法将回滚目录" "$RESTORE_MOVE_OUTPUT"
[[ -d "$REMOTE_ROOT/.deploy/failed-restore-move-failure" ]] || fail "目录移动恢复失败后失败目录不应删除"
[[ -d "$REMOTE_ROOT/.deploy/rollback-restore-move-failure" ]] || fail "目录移动恢复失败后回滚目录不应删除"
[[ ! -e "$APP_PATH" ]] || fail "目录移动恢复失败时应用目录不应伪装为已恢复"
[[ ! -e "$SERVICE_STATE" ]] || fail "目录移动恢复失败后服务不应仍在运行"
[[ ! -e "$RESTORE_MOVE_ARCHIVE" && ! -e "$RESTORE_MOVE_CHECKSUM" ]] || fail "目录移动恢复失败后发布包未清理"
[[ ! -e "$REMOTE_ROOT/.deploy/lock" ]] || fail "目录移动恢复失败后部署锁未清理"

echo "systemd 源码发布脚本测试通过"
