#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-standalone-remote-test.XXXXXX")"
TEST_ROOT="$(cd "$TEST_ROOT" && pwd -P)"
FAKE_BIN="$TEST_ROOT/bin"
FAKE_PRISMA_RUNTIME="$TEST_ROOT/runtime-node_modules"
FAKE_PRISMA_BIN="$FAKE_PRISMA_RUNTIME/.bin/prisma"
REAL_PRISMA_RUNTIME="$PROJECT_ROOT/node_modules"
REAL_PRISMA_BIN="$REAL_PRISMA_RUNTIME/.bin/prisma"
CONFIG_TEST_RELEASE="$TEST_ROOT/prisma-config-release"
CONFIG_TEST_LOG="$TEST_ROOT/prisma-config-without-node-path.log"
REMOTE_ROOT="$TEST_ROOT/remote"
REMOTE_APP="$REMOTE_ROOT/school"
RUNTIME_ENV="$REMOTE_ROOT/.deploy/runtime.env"
INCOMING="$REMOTE_ROOT/.deploy/incoming"
STATE_FILE="$TEST_ROOT/service-active"
COMMAND_LOG="$TEST_ROOT/commands.log"
ORIGINAL_PATH="$PATH"
FAIL_ROOT="$TEST_ROOT/failure-remote"
FAIL_APP="$FAIL_ROOT/school"
FAIL_ENV="$FAIL_ROOT/.deploy/runtime.env"
FAIL_INCOMING="$FAIL_ROOT/.deploy/incoming"
FAIL_STATE_FILE="$TEST_ROOT/failure-service-active"
FAIL_LOG="$TEST_ROOT/failure-commands.log"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'standalone 远程发布测试失败：%s\n' "$*" >&2
  exit 1
}

assert_file() {
  [[ -f "$1" ]] || fail "文件不存在：$1"
}

assert_link() {
  [[ -L "$1" ]] || fail "不是符号链接：$1"
}

mkdir -p "$FAKE_BIN" "$FAKE_PRISMA_RUNTIME/.bin" "$REMOTE_APP" "$INCOMING" "$(dirname "$RUNTIME_ENV")"
: > "$STATE_FILE"
: > "$COMMAND_LOG"
printf '%s\n' 'DATABASE_URL=mysql://test/test' > "$RUNTIME_ENV"
printf '%s\n' 'old release' > "$REMOTE_APP/old.txt"

mkdir -p "$TEST_ROOT/archive-root/school/.next/standalone" "$TEST_ROOT/archive-root/school/.next/static" "$TEST_ROOT/archive-root/school/public" "$TEST_ROOT/archive-root/school/prisma/migrations/20260901000000_init"
printf '%s\n' 'standalone server' > "$TEST_ROOT/archive-root/school/.next/standalone/server.js"
printf '%s\n' 'static' > "$TEST_ROOT/archive-root/school/.next/static/app.js"
printf '%s\n' 'public' > "$TEST_ROOT/archive-root/school/public/robots.txt"
printf '%s\n' '{"name":"school"}' > "$TEST_ROOT/archive-root/school/package.json"
printf '%s\n' 'DATABASE_URL=mysql://test/test' > "$TEST_ROOT/archive-root/school/prisma.config.ts"
printf '%s\n' 'migration' > "$TEST_ROOT/archive-root/school/prisma/migrations/20260901000000_init/migration.sql"
SOURCE_ARCHIVE="$TEST_ROOT/school-standalone-test.tar.gz"
SOURCE_CHECKSUM="$SOURCE_ARCHIVE.sha256"
(cd "$TEST_ROOT/archive-root" && tar -czf "$SOURCE_ARCHIVE" school)
(cd "$TEST_ROOT" && sha256sum "$(basename "$SOURCE_ARCHIVE")" > "$(basename "$SOURCE_CHECKSUM")")
ARCHIVE_PATH="$INCOMING/school-standalone-test.tar.gz"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"
cp "$SOURCE_ARCHIVE" "$INCOMING/"
cp "$SOURCE_CHECKSUM" "$INCOMING/"

[[ -x "$REAL_PRISMA_BIN" ]] || fail "测试需要 Prisma CLI：$REAL_PRISMA_BIN"
mkdir -p "$CONFIG_TEST_RELEASE"
cp -R "$PROJECT_ROOT/prisma" "$CONFIG_TEST_RELEASE/prisma"
cp "$PROJECT_ROOT/prisma.config.ts" "$CONFIG_TEST_RELEASE/prisma.config.ts"

set +e
(
  cd "$CONFIG_TEST_RELEASE"
  env -u NODE_PATH DATABASE_URL='mysql://school:ci@127.0.0.1:3306/school' \
    "$REAL_PRISMA_BIN" validate --config "$CONFIG_TEST_RELEASE/prisma.config.ts"
) > "$CONFIG_TEST_LOG" 2>&1
config_without_node_path_exit=$?
set -e
(( config_without_node_path_exit != 0 )) || fail '缺少 NODE_PATH 时 Prisma 配置不应加载成功'
grep -Fq "Cannot find module 'prisma/config'" "$CONFIG_TEST_LOG" || {
  sed -n '1,120p' "$CONFIG_TEST_LOG" >&2
  fail '缺少 NODE_PATH 时未复现 Prisma 模块解析失败'
}

(
  cd "$CONFIG_TEST_RELEASE"
  NODE_PATH="$REAL_PRISMA_RUNTIME" DATABASE_URL='mysql://school:ci@127.0.0.1:3306/school' \
    "$REAL_PRISMA_BIN" validate --config "$CONFIG_TEST_RELEASE/prisma.config.ts"
)

cat > "$FAKE_BIN/systemctl" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'systemctl %s\n' "$*" >> "$DEPLOY_TEST_COMMAND_LOG"
  case "${1:-}" in
  show)
    case " $* " in
      *" -p User "*) printf '%s\n' "${DEPLOY_TEST_USER:?}" ;;
      *" -p Group "*) printf '%s\n' "${DEPLOY_TEST_GROUP:?}" ;;
      *" -p WorkingDirectory "*) printf '%s\n' "${DEPLOY_TEST_WORKDIR:?}" ;;
      *" -p ExecStart "*) printf '%s\n' "${DEPLOY_TEST_EXEC_START:?}" ;;
      *) exit 2 ;;
    esac
    ;;
  is-active) [[ -f "$DEPLOY_TEST_STATE_FILE" ]] ;;
  stop) rm -f "$DEPLOY_TEST_STATE_FILE" ;;
  start) : > "$DEPLOY_TEST_STATE_FILE" ;;
  daemon-reload) : ;;
  *) exit 2 ;;
esac
SCRIPT
chmod +x "$FAKE_BIN/systemctl"

cat > "$FAKE_BIN/curl" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'curl %s\n' "$*" >> "$DEPLOY_TEST_COMMAND_LOG"
if [[ "${DEPLOY_TEST_CURL_STATUS:-200}" == 200 ]]; then
  printf '200'
else
  printf '%s' "${DEPLOY_TEST_CURL_STATUS}"
fi
SCRIPT
chmod +x "$FAKE_BIN/curl"

cat > "$FAKE_BIN/chown" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
printf 'chown %s\n' "$*" >> "$DEPLOY_TEST_COMMAND_LOG"
SCRIPT
chmod +x "$FAKE_BIN/chown"

cat > "$FAKE_PRISMA_BIN" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail
[[ -n "${DATABASE_URL:-}" ]] || { printf '%s\n' 'DATABASE_URL 未从运行时 .env 导出' >&2; exit 78; }
[[ "${NODE_PATH:-}" == "${DEPLOY_TEST_PRISMA_NODE_PATH:?}" || "${NODE_PATH:-}" == "${DEPLOY_TEST_PRISMA_NODE_PATH}:"* ]] || {
  printf '%s\n' 'Prisma 未从运行时依赖目录解析模块' >&2
  exit 79
}
case "${1:-}" in
  validate)
    [[ "${2:-}" == --config && "${3:-}" == */prisma.config.ts ]] || {
      printf '%s\n' 'Prisma 配置校验未显式指定 prisma.config.ts' >&2
      exit 80
    }
    ;;
  migrate)
    [[ "${2:-}" == deploy && "${3:-}" == --config && "${4:-}" == */prisma.config.ts ]] || {
      printf '%s\n' 'Prisma 迁移未显式指定 prisma.config.ts' >&2
      exit 81
    }
    ;;
  *)
    printf '未知 Prisma 命令：%s\n' "${1:-}" >&2
    exit 82
    ;;
esac
printf 'prisma node_path=%s args=%s\n' "$NODE_PATH" "$*" >> "$DEPLOY_TEST_COMMAND_LOG"
if [[ "${DEPLOY_TEST_PRISMA_FAIL:-false}" == true ]]; then
  exit 77
fi
SCRIPT
chmod +x "$FAKE_PRISMA_BIN"

cat > "$FAKE_BIN/sleep" <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
chmod +x "$FAKE_BIN/sleep"

set +e
DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
DEPLOY_TEST_STATE_FILE="$STATE_FILE" \
DEPLOY_TEST_USER="$(id -un)" \
DEPLOY_TEST_GROUP="$(id -gn)" \
DEPLOY_TEST_WORKDIR="$REMOTE_APP" \
DEPLOY_TEST_EXEC_START='legacy-next-start' \
DEPLOY_TEST_PRISMA_NODE_PATH="$FAKE_PRISMA_RUNTIME" \
DEPLOY_STANDALONE_SERVICE_OVERRIDE_PATH="$REMOTE_ROOT/etc/systemd/system/school-next.service.d/standalone.conf" \
PATH="$FAKE_BIN:$ORIGINAL_PATH" \
bash -x "$PROJECT_ROOT/scripts/remote-deploy-standalone.sh" \
  "$REMOTE_ROOT" \
  "$ARCHIVE_PATH" \
  "$CHECKSUM_PATH" \
  first-release \
  "$RUNTIME_ENV" \
  school-next.service \
  "$REMOTE_APP" \
  http://127.0.0.1:3000/api/health \
  3 \
  "$FAKE_PRISMA_BIN" > "$TEST_ROOT/remote-debug.log" 2>&1
remote_exit_code=$?
set -e
if (( remote_exit_code != 0 )); then
  cat "$TEST_ROOT/remote-debug.log" >&2
  cat "$COMMAND_LOG" >&2
  exit "$remote_exit_code"
fi

assert_file "$REMOTE_APP/.next/standalone/server.js"
[[ ! -f "$REMOTE_APP/old.txt" ]] || fail '旧应用未被移入回滚目录'
assert_file "$REMOTE_ROOT/.deploy/rollback-first-release/old.txt"
assert_link "$REMOTE_APP/.env"
[[ "$(readlink "$REMOTE_APP/.env")" == "$RUNTIME_ENV" ]] || fail '.env 链接目标错误'
[[ -f "$STATE_FILE" ]] || fail 'systemd 服务未启动'
grep -Fq "prisma node_path=$FAKE_PRISMA_RUNTIME args=validate --config $REMOTE_ROOT/.deploy/releases/first-release/prisma.config.ts" "$COMMAND_LOG" || fail '未使用运行时依赖目录校验 Prisma 配置'
grep -Fq "prisma node_path=$FAKE_PRISMA_RUNTIME args=migrate deploy --config $REMOTE_ROOT/.deploy/releases/first-release/prisma.config.ts" "$COMMAND_LOG" || fail '未使用运行时依赖目录执行 Prisma 迁移'
grep -Fq 'systemctl stop school-next.service' "$COMMAND_LOG" || fail '未停止旧服务'
assert_file "$REMOTE_ROOT/etc/systemd/system/school-next.service.d/standalone.conf"
grep -Fq "ExecStart=/usr/local/bin/node $REMOTE_APP/.next/standalone/server.js" "$REMOTE_ROOT/etc/systemd/system/school-next.service.d/standalone.conf" || fail '未写入 standalone ExecStart'
grep -Fq 'systemctl daemon-reload' "$COMMAND_LOG" || fail '未重新加载 systemd 配置'

mkdir -p "$FAIL_APP" "$FAIL_INCOMING" "$(dirname "$FAIL_ENV")"
: > "$FAIL_STATE_FILE"
: > "$FAIL_LOG"
printf '%s\n' 'DATABASE_URL=mysql://test/test' > "$FAIL_ENV"
printf '%s\n' 'old failure release' > "$FAIL_APP/old.txt"
cp "$SOURCE_ARCHIVE" "$FAIL_INCOMING/"
cp "$SOURCE_CHECKSUM" "$FAIL_INCOMING/"
FAIL_ARCHIVE="$FAIL_INCOMING/school-standalone-test.tar.gz"
FAIL_CHECKSUM="$FAIL_ARCHIVE.sha256"

set +e
DEPLOY_TEST_COMMAND_LOG="$FAIL_LOG" \
DEPLOY_TEST_STATE_FILE="$FAIL_STATE_FILE" \
DEPLOY_TEST_USER="$(id -un)" \
DEPLOY_TEST_GROUP="$(id -gn)" \
DEPLOY_TEST_WORKDIR="$FAIL_APP" \
DEPLOY_TEST_EXEC_START='legacy-next-start' \
DEPLOY_TEST_CURL_STATUS=503 \
DEPLOY_TEST_PRISMA_NODE_PATH="$FAKE_PRISMA_RUNTIME" \
DEPLOY_STANDALONE_SERVICE_OVERRIDE_PATH="$FAIL_ROOT/etc/systemd/system/school-next.service.d/standalone.conf" \
PATH="$FAKE_BIN:$ORIGINAL_PATH" \
bash "$PROJECT_ROOT/scripts/remote-deploy-standalone.sh" \
  "$FAIL_ROOT" \
  "$FAIL_ARCHIVE" \
  "$FAIL_CHECKSUM" \
  failed-release \
  "$FAIL_ENV" \
  school-next.service \
  "$FAIL_APP" \
  http://127.0.0.1:3000/api/health \
  3 \
  "$FAKE_PRISMA_BIN" >/dev/null 2>&1
failure_exit_code=$?
set -e
(( failure_exit_code != 0 )) || fail '健康检查失败时 standalone 发布不应成功'
assert_file "$FAIL_APP/old.txt"
[[ ! -e "$FAIL_ROOT/.deploy/releases/failed-release" ]] || fail '失败 release 未清理'
[[ ! -e "$FAIL_ROOT/.deploy/rollback-failed-release" ]] || fail '旧目录未恢复到应用目录'
[[ -f "$FAIL_STATE_FILE" ]] || fail '失败后旧 systemd 服务未恢复'
[[ ! -e "$FAIL_ROOT/etc/systemd/system/school-next.service.d/standalone.conf" ]] || fail '失败后 systemd drop-in 未恢复'
[[ ! -e "$FAIL_ROOT/.deploy/lock" ]] || fail '失败后部署锁未清理'
[[ ! -e "$FAIL_ARCHIVE" && ! -e "$FAIL_CHECKSUM" ]] || fail '失败后发布包未清理'

printf '%s\n' 'standalone 远程发布测试通过'
