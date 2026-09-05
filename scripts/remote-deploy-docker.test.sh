#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-docker-deploy-test.XXXXXX")"
FAKE_BIN="$TEST_ROOT/bin"
REMOTE_ROOT="$TEST_ROOT/remote"
INCOMING="$REMOTE_ROOT/.deploy/incoming"
RUNTIME_ENV="$REMOTE_ROOT/.deploy/runtime.env"
COMMAND_LOG="$TEST_ROOT/commands.log"
LEGACY_ACTIVE="$TEST_ROOT/legacy-active"
LEGACY_ENABLED="$TEST_ROOT/legacy-enabled"
IMAGE_LOADED="$TEST_ROOT/image-loaded"
ROLLBACK_ACTIVE="$TEST_ROOT/rollback-active"
ORIGINAL_PATH="$PATH"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'Docker 远程发布测试失败：%s\n' "$*"
  exit 1
}

assert_file() {
  [[ -f "$1" ]] || fail "文件不存在：$1"
}

assert_not_exists() {
  [[ ! -e "$1" && ! -L "$1" ]] || fail "文件或符号链接不应存在：$1"
}

assert_contains() {
  local expected="$1"
  local file="$2"
  grep -Fq -- "$expected" "$file" || fail "未在 $file 中找到：$expected"
}

mkdir -p "$FAKE_BIN" "$INCOMING" "$(dirname "$RUNTIME_ENV")"
: > "$COMMAND_LOG"
printf '%s\n' 'DATABASE_URL=mysql://test/test' > "$RUNTIME_ENV"
printf '%s\n' 'services: {}' > "$INCOMING/docker-compose.production.yml"
printf '%s\n' 'docker image fixture' > "$INCOMING/school-image.tar.gz"
(cd "$INCOMING" && sha256sum school-image.tar.gz > school-image.tar.gz.sha256)

cat > "$FAKE_BIN/docker" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

printf 'docker' >> "$DEPLOY_TEST_COMMAND_LOG"
printf ' %q' "$@" >> "$DEPLOY_TEST_COMMAND_LOG"
printf '\n' >> "$DEPLOY_TEST_COMMAND_LOG"

case "${1:-}" in
  load)
    [[ "${2:-}" == --input && -f "${3:-}" ]] || exit 21
    : > "$DEPLOY_TEST_IMAGE_LOADED"
    ;;
  image)
    case "${2:-}" in
      inspect|prune) ;;
      *) exit 22 ;;
    esac
    ;;
  rmi)
    ;;
  builder)
    ;;
  compose)
    shift
    [[ "${1:-}" == version ]] && exit 0
    compose_file=''
    while [[ $# -gt 0 ]]; do
      case "$1" in
        -f)
          compose_file="$2"
          shift 2
          ;;
        -p|--project-name)
          shift 2
          ;;
        --env-file)
          shift 2
          ;;
        *)
          break
          ;;
      esac
    done
    command="${1:-}"
    case "$command" in
      config)
        ;;
      run)
        [[ "${DEPLOY_TEST_MIGRATION_FAIL:-false}" != true ]] || exit 77
        ;;
      up)
        if [[ "$compose_file" == *second-release* && "${DEPLOY_TEST_UP_FAIL:-false}" == true ]]; then
          exit 76
        fi
        if [[ "$compose_file" == *first-release* ]]; then
          : > "$DEPLOY_TEST_ROLLBACK_ACTIVE"
        fi
        ;;
      down)
        ;;
      *)
        exit 23
        ;;
    esac
    ;;
  *)
    exit 24
    ;;
esac
SCRIPT
chmod +x "$FAKE_BIN/docker"

cat > "$FAKE_BIN/systemctl" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

printf 'systemctl' >> "$DEPLOY_TEST_COMMAND_LOG"
printf ' %q' "$@" >> "$DEPLOY_TEST_COMMAND_LOG"
printf '\n' >> "$DEPLOY_TEST_COMMAND_LOG"

case "${1:-}" in
  is-active)
    [[ -f "$DEPLOY_TEST_LEGACY_ACTIVE" ]]
    ;;
  is-enabled)
    [[ -f "$DEPLOY_TEST_LEGACY_ENABLED" ]]
    ;;
  stop)
    rm -f "$DEPLOY_TEST_LEGACY_ACTIVE"
    ;;
  start)
    : > "$DEPLOY_TEST_LEGACY_ACTIVE"
    ;;
  disable)
    rm -f "$DEPLOY_TEST_LEGACY_ENABLED"
    ;;
  *)
    exit 25
    ;;
esac
SCRIPT
chmod +x "$FAKE_BIN/systemctl"

cat > "$FAKE_BIN/curl" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

printf 'curl' >> "$DEPLOY_TEST_COMMAND_LOG"
printf ' %q' "$@" >> "$DEPLOY_TEST_COMMAND_LOG"
printf '\n' >> "$DEPLOY_TEST_COMMAND_LOG"
if [[ -f "$DEPLOY_TEST_ROLLBACK_ACTIVE" ]]; then
  printf '%s' "${DEPLOY_TEST_ROLLBACK_STATUS:-200}"
else
  printf '%s' "${DEPLOY_TEST_CURL_STATUS:-200}"
fi
SCRIPT
chmod +x "$FAKE_BIN/curl"

cat > "$FAKE_BIN/sleep" <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
chmod +x "$FAKE_BIN/sleep"

touch "$LEGACY_ACTIVE" "$LEGACY_ENABLED"
PATH="$FAKE_BIN:$ORIGINAL_PATH" \
  DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
  DEPLOY_TEST_LEGACY_ACTIVE="$LEGACY_ACTIVE" \
  DEPLOY_TEST_LEGACY_ENABLED="$LEGACY_ENABLED" \
  DEPLOY_TEST_IMAGE_LOADED="$IMAGE_LOADED" \
  DEPLOY_TEST_ROLLBACK_ACTIVE="$ROLLBACK_ACTIVE" \
  bash "$PROJECT_ROOT/scripts/remote-deploy-docker.sh" \
    "$REMOTE_ROOT" \
    "$INCOMING/school-image.tar.gz" \
    "$INCOMING/school-image.tar.gz.sha256" \
    "$INCOMING/docker-compose.production.yml" \
    first-release \
    "$RUNTIME_ENV" \
    school \
    http://127.0.0.1:3000/api/health \
    2 \
    school:first \
    school-next.service >/dev/null

assert_file "$IMAGE_LOADED"
assert_file "$REMOTE_ROOT/.deploy/docker/releases/first-release/docker-compose.production.yml"
[[ -L "$REMOTE_ROOT/.deploy/docker/current" ]] || fail '未创建当前 release 符号链接'
[[ "$(readlink "$REMOTE_ROOT/.deploy/docker/current")" == "$REMOTE_ROOT/.deploy/docker/releases/first-release" ]] || fail '当前 release 指向错误'
assert_not_exists "$INCOMING/school-image.tar.gz"
assert_not_exists "$INCOMING/school-image.tar.gz.sha256"
assert_not_exists "$INCOMING/docker-compose.production.yml"
assert_not_exists "$REMOTE_ROOT/.deploy/docker/lock"
assert_not_exists "$LEGACY_ACTIVE"
assert_not_exists "$LEGACY_ENABLED"
assert_contains 'docker load --input' "$COMMAND_LOG"
assert_contains 'config --quiet' "$COMMAND_LOG"
assert_contains 'run --rm --no-deps app ./node_modules/.bin/prisma validate --config /app/prisma.config.ts' "$COMMAND_LOG"
assert_contains 'run --rm --no-deps app ./node_modules/.bin/prisma migrate deploy --config /app/prisma.config.ts' "$COMMAND_LOG"
assert_contains 'up --detach --no-deps --force-recreate app' "$COMMAND_LOG"
assert_contains 'systemctl stop school-next.service' "$COMMAND_LOG"
assert_contains 'systemctl disable school-next.service' "$COMMAND_LOG"

mkdir -p "$INCOMING"
SECOND_COMPOSE="$INCOMING/docker-compose.production-second-release.yml"
printf '%s\n' 'services: {}' > "$SECOND_COMPOSE"
printf '%s\n' 'docker image fixture 2' > "$INCOMING/school-image.tar.gz"
(cd "$INCOMING" && sha256sum school-image.tar.gz > school-image.tar.gz.sha256)
rm -f "$ROLLBACK_ACTIVE"

set +e
PATH="$FAKE_BIN:$ORIGINAL_PATH" \
  DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
  DEPLOY_TEST_LEGACY_ACTIVE="$LEGACY_ACTIVE" \
  DEPLOY_TEST_LEGACY_ENABLED="$LEGACY_ENABLED" \
  DEPLOY_TEST_IMAGE_LOADED="$IMAGE_LOADED" \
  DEPLOY_TEST_ROLLBACK_ACTIVE="$ROLLBACK_ACTIVE" \
  DEPLOY_TEST_CURL_STATUS=503 \
  DEPLOY_TEST_ROLLBACK_STATUS=200 \
  bash "$PROJECT_ROOT/scripts/remote-deploy-docker.sh" \
    "$REMOTE_ROOT" \
    "$INCOMING/school-image.tar.gz" \
    "$INCOMING/school-image.tar.gz.sha256" \
    "$SECOND_COMPOSE" \
    second-release \
    "$RUNTIME_ENV" \
    school \
    http://127.0.0.1:3000/api/health \
    2 \
    school:second \
    school-next.service >"$TEST_ROOT/failure-output.log" 2>&1
failure_exit_code=$?
set -e

(( failure_exit_code != 0 )) || fail '健康检查失败时 Docker 发布不应成功'
[[ "$(readlink "$REMOTE_ROOT/.deploy/docker/current")" == "$REMOTE_ROOT/.deploy/docker/releases/first-release" ]] || fail '失败后未保留旧 release'
assert_not_exists "$REMOTE_ROOT/.deploy/docker/releases/second-release"
assert_not_exists "$REMOTE_ROOT/.deploy/docker/lock"
assert_not_exists "$INCOMING/school-image.tar.gz"
assert_not_exists "$INCOMING/school-image.tar.gz.sha256"
assert_not_exists "$SECOND_COMPOSE"
assert_contains '健康检查失败' "$TEST_ROOT/failure-output.log"
assert_contains 'up --detach --no-deps --force-recreate app' "$COMMAND_LOG"

printf '%s\n' 'Docker 远程发布测试通过'
