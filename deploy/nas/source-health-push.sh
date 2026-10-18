#!/bin/sh
# 在 NAS 上探测源站并把健康清单发布到 GitHub main。
#
# 依赖：node（推荐）或 docker + node:20-alpine；不需要 git / 仓库副本。
# 必填：MOONTV_GITHUB_TOKEN —— 细粒度 token，仅需目标仓库 Contents: Read and write
#
# 建议每 12 小时执行：
#   0 */12 * * * sh /volume2/others/docker/moontv-local/deploy/nas/source-health-push.sh >> /volume2/others/docker/moontv-health.log 2>&1

set -eu

DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

if [ -z "${MOONTV_GITHUB_TOKEN:-}" ]; then
  echo "缺少 MOONTV_GITHUB_TOKEN" >&2
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  exec node "$DIR/scripts/publish-source-health.mjs"
fi

# NAS 宿主没有 node 时，复用已有的 node:20-alpine 镜像。
# 容器以目录属主身份运行，绕开 Synology Windows ACL：root 看到 000，属主才能读。
RUN_UID=$(stat -c %u "$DIR" 2>/dev/null || id -u)
RUN_GID=$(stat -c %g "$DIR" 2>/dev/null || id -g)
DOCKER="${MOONTV_DOCKER:-docker}"
exec $DOCKER run --rm \
  --user "$RUN_UID:$RUN_GID" \
  -e MOONTV_GITHUB_TOKEN \
  -e MOONTV_REPO \
  -e MOONTV_BRANCH \
  -e SOURCE_HEALTH_CONFIG \
  -e SOURCE_HEALTH_TIMEOUT_MS \
  -e SOURCE_HEALTH_CONCURRENCY \
  -e MOONTV_PUBLISH_DRY_RUN \
  -v "$DIR:/repo:ro" \
  node:20-alpine \
  node /repo/scripts/publish-source-health.mjs
