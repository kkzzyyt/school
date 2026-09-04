#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/school-docker-registry-test.XXXXXX")"
FAKE_BIN="$TEST_ROOT/bin"
REMOTE_ROOT="$TEST_ROOT/remote"
INCOMING="$REMOTE_ROOT/.deploy/incoming"
RUNTIME_ENV="$REMOTE_ROOT/.deploy/runtime.env"
COMMAND_LOG="$TEST_ROOT/commands.log"
LEGACY_ACTIVE="$TEST_ROOT/legacy-active"
LEGACY_ENABLED="$TEST_ROOT/legacy-enabled"
ACTIVE_IMAGE="$TEST_ROOT/active-image"
IMAGE_PULLED="$TEST_ROOT/image-pulled"
PULL_ATTEMPTS="$TEST_ROOT/pull-attempts"
ORIGINAL_PATH="$PATH"

cleanup() {
  rm -rf "$TEST_ROOT"
}
trap cleanup EXIT

fail() {
  printf 'Docker registry 远程发布测试失败：%s\n' "$*" >&2
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

mkdir -p "$FAKE_BIN" "$INCOMING" "$REMOTE_ROOT/.deploy/docker/releases/old-release"
: > "$COMMAND_LOG"
printf '%s\n' 'DATABASE_URL=mysql://test/test' > "$RUNTIME_ENV"
printf '%s\n' 'school:old' > "$REMOTE_ROOT/.deploy/docker/releases/old-release/image-ref"
printf '%s\n' 'services: {}' > "$INCOMING/docker-compose.production.yml"
printf '%s\n' 'school:old' > "$ACTIVE_IMAGE"
touch "$LEGACY_ACTIVE" "$LEGACY_ENABLED"

cat > "$FAKE_BIN/docker" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

printf 'docker' >> "$DEPLOY_TEST_COMMAND_LOG"
printf ' %q' "$@" >> "$DEPLOY_TEST_COMMAND_LOG"
printf '\n' >> "$DEPLOY_TEST_COMMAND_LOG"

case "${1:-}" in
  pull)
    pull_attempts=0
    if [[ -f "$DEPLOY_TEST_PULL_ATTEMPTS" ]]; then
      pull_attempts="$(sed -n '1p' "$DEPLOY_TEST_PULL_ATTEMPTS")"
    fi
    pull_attempts=$((pull_attempts + 1))
    printf '%s\n' "$pull_attempts" > "$DEPLOY_TEST_PULL_ATTEMPTS"
    if [[ "${DEPLOY_TEST_FAIL_PULL_FIRST:-false}" == true && "$pull_attempts" == 1 ]]; then
      exit 55
    fi
    : > "$DEPLOY_TEST_IMAGE_PULLED"
    ;;
  image)
    [[ "${2:-}" == inspect ]] || exit 22
    ;;
  inspect)
    cat "$DEPLOY_TEST_ACTIVE_IMAGE"
    ;;
  ps)
    printf '%s\n' app-container
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
        *)
          break
          ;;
      esac
    done
    command="${1:-}"
    case "$command" in
      config|run)
        ;;
      up)
        if [[ "${DEPLOY_TEST_UP_STALE:-false}" != true ]]; then
          printf '%s\n' "$SCHOOL_IMAGE" > "$DEPLOY_TEST_ACTIVE_IMAGE"
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

active_image="$(sed -n '1p' "$DEPLOY_TEST_ACTIVE_IMAGE")"
if [[ "$active_image" == "${DEPLOY_TEST_ROLLBACK_IMAGE:-}" ]]; then
  printf '%s' 200
else
  printf '%s' "${DEPLOY_TEST_HEALTH_STATUS:-200}"
fi
SCRIPT
chmod +x "$FAKE_BIN/curl"

cat > "$FAKE_BIN/sleep" <<'SCRIPT'
#!/usr/bin/env bash
exit 0
SCRIPT
chmod +x "$FAKE_BIN/sleep"

cat > "$FAKE_BIN/timeout" <<'SCRIPT'
#!/usr/bin/env bash
set -Eeuo pipefail

printf 'timeout' >> "$DEPLOY_TEST_COMMAND_LOG"
printf ' %q' "$@" >> "$DEPLOY_TEST_COMMAND_LOG"
printf '\n' >> "$DEPLOY_TEST_COMMAND_LOG"

[[ "${1:-}" == "30" ]] || exit 26
shift
"$@"
SCRIPT
chmod +x "$FAKE_BIN/timeout"

PATH="$FAKE_BIN:$ORIGINAL_PATH" \
  DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
  DEPLOY_TEST_LEGACY_ACTIVE="$LEGACY_ACTIVE" \
  DEPLOY_TEST_LEGACY_ENABLED="$LEGACY_ENABLED" \
  DEPLOY_TEST_ACTIVE_IMAGE="$ACTIVE_IMAGE" \
  DEPLOY_TEST_IMAGE_PULLED="$IMAGE_PULLED" \
  DEPLOY_TEST_PULL_ATTEMPTS="$PULL_ATTEMPTS" \
  DEPLOY_TEST_FAIL_PULL_FIRST=true \
  DEPLOY_TEST_ROLLBACK_IMAGE=school:first \
  DEPLOY_TEST_HEALTH_STATUS=200 \
  bash "$PROJECT_ROOT/scripts/remote-deploy-docker-registry.sh" \
    "$REMOTE_ROOT" \
    "$INCOMING/docker-compose.production.yml" \
    first-release \
    "$RUNTIME_ENV" \
    school \
    http://127.0.0.1:3000/api/health \
    2 \
    school:first \
    school-next.service \
    30 >/dev/null

assert_file "$IMAGE_PULLED"
assert_file "$REMOTE_ROOT/.deploy/docker/releases/first-release/docker-compose.production.yml"
[[ -L "$REMOTE_ROOT/.deploy/docker/current" ]] || fail '首次发布未创建 current 符号链接'
[[ "$(readlink "$REMOTE_ROOT/.deploy/docker/current")" == "$REMOTE_ROOT/.deploy/docker/releases/first-release" ]] || fail '首次发布 current 指向错误'
assert_not_exists "$INCOMING/docker-compose.production.yml"
assert_not_exists "$REMOTE_ROOT/.deploy/docker/lock"
assert_not_exists "$LEGACY_ACTIVE"
assert_not_exists "$LEGACY_ENABLED"
assert_contains 'timeout 30 docker pull --platform linux/amd64 school:first' "$COMMAND_LOG"
assert_contains 'up --detach --no-deps --force-recreate app' "$COMMAND_LOG"
assert_contains 'systemctl stop school-next.service' "$COMMAND_LOG"
assert_contains 'systemctl disable school-next.service' "$COMMAND_LOG"

mkdir -p "$INCOMING"
SECOND_COMPOSE="$INCOMING/docker-compose.production-second-release.yml"
printf '%s\n' 'services: {}' > "$SECOND_COMPOSE"
printf '%s\n' 'school:first' > "$ACTIVE_IMAGE"

set +e
PATH="$FAKE_BIN:$ORIGINAL_PATH" \
  DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
  DEPLOY_TEST_LEGACY_ACTIVE="$LEGACY_ACTIVE" \
  DEPLOY_TEST_LEGACY_ENABLED="$LEGACY_ENABLED" \
  DEPLOY_TEST_ACTIVE_IMAGE="$ACTIVE_IMAGE" \
  DEPLOY_TEST_IMAGE_PULLED="$IMAGE_PULLED" \
  DEPLOY_TEST_PULL_ATTEMPTS="$PULL_ATTEMPTS" \
  DEPLOY_TEST_ROLLBACK_IMAGE=school:first \
  DEPLOY_TEST_HEALTH_STATUS=503 \
  bash "$PROJECT_ROOT/scripts/remote-deploy-docker-registry.sh" \
    "$REMOTE_ROOT" \
    "$SECOND_COMPOSE" \
    second-release \
    "$RUNTIME_ENV" \
    school \
    http://127.0.0.1:3000/api/health \
    2 \
    school:second \
    school-next.service \
    30 >"$TEST_ROOT/failure-output.log" 2>&1
failure_exit_code=$?
set -e

(( failure_exit_code != 0 )) || fail '健康检查失败时 registry 发布不应成功'
[[ "$(readlink "$REMOTE_ROOT/.deploy/docker/current")" == "$REMOTE_ROOT/.deploy/docker/releases/first-release" ]] || fail '健康检查失败后未保留旧 release'
assert_not_exists "$REMOTE_ROOT/.deploy/docker/releases/second-release"
assert_not_exists "$REMOTE_ROOT/.deploy/docker/lock"
assert_not_exists "$SECOND_COMPOSE"
assert_contains '健康检查失败' "$TEST_ROOT/failure-output.log"

mkdir -p "$INCOMING"
STALE_COMPOSE="$INCOMING/docker-compose.production-stale-release.yml"
printf '%s\n' 'services: {}' > "$STALE_COMPOSE"
printf '%s\n' 'school:first' > "$ACTIVE_IMAGE"

set +e
PATH="$FAKE_BIN:$ORIGINAL_PATH" \
  DEPLOY_TEST_COMMAND_LOG="$COMMAND_LOG" \
  DEPLOY_TEST_LEGACY_ACTIVE="$LEGACY_ACTIVE" \
  DEPLOY_TEST_LEGACY_ENABLED="$LEGACY_ENABLED" \
  DEPLOY_TEST_ACTIVE_IMAGE="$ACTIVE_IMAGE" \
  DEPLOY_TEST_IMAGE_PULLED="$IMAGE_PULLED" \
  DEPLOY_TEST_PULL_ATTEMPTS="$PULL_ATTEMPTS" \
  DEPLOY_TEST_ROLLBACK_IMAGE=school:first \
  DEPLOY_TEST_HEALTH_STATUS=200 \
  DEPLOY_TEST_UP_STALE=true \
  bash "$PROJECT_ROOT/scripts/remote-deploy-docker-registry.sh" \
    "$REMOTE_ROOT" \
    "$STALE_COMPOSE" \
    stale-release \
    "$RUNTIME_ENV" \
    school \
    http://127.0.0.1:3000/api/health \
    2 \
    school:stale \
    school-next.service \
    30 >"$TEST_ROOT/stale-output.log" 2>&1
stale_exit_code=$?
set -e

(( stale_exit_code != 0 )) || fail '运行中镜像不匹配时 registry 发布不应成功'
[[ "$(readlink "$REMOTE_ROOT/.deploy/docker/current")" == "$REMOTE_ROOT/.deploy/docker/releases/first-release" ]] || fail '镜像不匹配后未保留旧 release'
assert_not_exists "$REMOTE_ROOT/.deploy/docker/releases/stale-release"
assert_not_exists "$REMOTE_ROOT/.deploy/docker/lock"
assert_not_exists "$STALE_COMPOSE"
assert_contains '运行中的镜像不匹配' "$TEST_ROOT/stale-output.log"

printf '%s\n' 'Docker registry 远程发布测试通过'
