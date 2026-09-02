#!/usr/bin/env bash

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
WORKFLOW="$PROJECT_ROOT/.github/workflows/ci-cd.yml"

fail() {
  printf 'CI/CD 配置测试失败：%s\n' "$*" >&2
  exit 1
}

[[ -f "$WORKFLOW" ]] || fail '缺少 .github/workflows/ci-cd.yml'

for required_text in \
  'pull_request:' \
  'push:' \
  'branches: [main]' \
  'concurrency:' \
  'cancel-in-progress: true' \
  'npm ci --no-audit --no-fund' \
  'npm run lint' \
  'npm run typecheck' \
  'npm run test:coverage' \
  'npm run build' \
  'npm run package:standalone' \
  'actions/upload-artifact@v4' \
  'actions/download-artifact@v4' \
  'sleep 600' \
  'SCHOOL_DEPLOY_SSH_KEY' \
  'SCHOOL_DEPLOY_KNOWN_HOSTS' \
  'scripts/remote-deploy-standalone.sh'; do
  grep -Fq -- "$required_text" "$WORKFLOW" || fail "workflow 缺少：$required_text"
done

grep -Fq "github.event_name == 'push'" "$WORKFLOW" || fail '生产部署未限制在 push 事件'
grep -Fq "github.ref == 'refs/heads/main'" "$WORKFLOW" || fail '生产部署未限制在 main 分支'

printf '%s\n' 'CI/CD 配置测试通过'
