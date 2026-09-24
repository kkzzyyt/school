#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DOCKERFILE="$PROJECT_ROOT/Dockerfile"
COMPOSE_FILE="$PROJECT_ROOT/docker-compose.production.yml"
DOCKERIGNORE="$PROJECT_ROOT/.dockerignore"
NEXT_CONFIG="$PROJECT_ROOT/next.config.ts"

fail() {
  printf 'Docker 配置测试失败：%s\n' "$*" >&2
  exit 1
}

assert_file() {
  [[ -f "$1" ]] || fail "缺少文件：$1"
}

assert_contains() {
  local expected="$1"
  local file="$2"
  grep -Fq -- "$expected" "$file" || fail "$file 缺少：$expected"
}

assert_not_contains() {
  local forbidden="$1"
  local file="$2"
  if grep -Fq -- "$forbidden" "$file"; then
    fail "$file 不应包含：$forbidden"
  fi
}

assert_file "$DOCKERFILE"
assert_file "$COMPOSE_FILE"
assert_file "$DOCKERIGNORE"
assert_file "$NEXT_CONFIG"

assert_contains 'serverExternalPackages' "$NEXT_CONFIG"
assert_contains '"argon2"' "$NEXT_CONFIG"

for required_text in \
  'ARG NODE_VERSION=24.13.0-slim' \
  'npm ci --no-audit --no-fund' \
  'npm prune --omit=dev --ignore-scripts --no-audit --no-fund' \
  'ENV DATABASE_URL=mysql://school:build@127.0.0.1:3306/school' \
  'npm run db:generate && npm run build' \
  'npm run build' \
  'require("argon2")' \
  '/app/.next/standalone' \
  'USER node' \
  'CMD ["node", "server.js"]'; do
  assert_contains "$required_text" "$DOCKERFILE"
done

assert_contains 'FROM dependencies AS production-dependencies' "$DOCKERFILE"
assert_not_contains 'FROM builder AS production-dependencies' "$DOCKERFILE"
assert_contains 'COPY prisma/schema.prisma ./prisma/schema.prisma' "$DOCKERFILE"
assert_not_contains 'COPY prisma ./prisma' "$DOCKERFILE"
assert_contains 'chown node:node /app/.next/cache' "$DOCKERFILE"
assert_not_contains 'chown -R node:node' "$DOCKERFILE"

dependencies_copy_line="$(grep -n -m 1 'COPY --from=production-dependencies' "$DOCKERFILE" | cut -d: -f1)"
standalone_copy_line="$(grep -n -m 1 'COPY --from=builder --chown=node:node /app/.next/standalone' "$DOCKERFILE" | cut -d: -f1)"
revision_label_line="$(grep -n -m 1 'LABEL org.opencontainers.image.revision' "$DOCKERFILE" | cut -d: -f1)"
(( dependencies_copy_line < standalone_copy_line && standalone_copy_line < revision_label_line )) || {
  fail '稳定依赖层必须在构建产物之前复制，提交标签必须放在最后'
}

for required_text in \
  'services:' \
  'app:' \
  'image: ${SCHOOL_IMAGE:?SCHOOL_IMAGE is required}' \
  '- ${SCHOOL_RUNTIME_ENV_FILE:?SCHOOL_RUNTIME_ENV_FILE is required}' \
  'network_mode: host' \
  'NODE_ENV: production' \
  'HOSTNAME: 127.0.0.1' \
  'PORT: "3000"' \
  'healthcheck:' \
  'restart: unless-stopped' \
  'init: true' \
  'stop_grace_period: 30s'; do
  assert_contains "$required_text" "$COMPOSE_FILE"
done

for required_text in \
  'node_modules' \
  '.next' \
  '.git' \
  '.env*' \
  '!.env.example' \
  'releases'; do
  assert_contains "$required_text" "$DOCKERIGNORE"
done

assert_not_contains 'COPY .env' "$DOCKERFILE"
assert_not_contains 'MYSQL_ROOT_PASSWORD=' "$COMPOSE_FILE"

printf '%s\n' 'Docker 配置测试通过'
