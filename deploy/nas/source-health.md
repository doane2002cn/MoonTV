# NAS 源站健康探测（方案 A）

NAS 负责探测，Cloudflare 负责发布：

- NAS 每 12 小时运行一次探测，把 `public/docs/sources_health.json` 提交到 GitHub `main`
- 线上 `https://moontv.12879737.xyz/api/sources/health` 读取仓库里的最新清单
- GitHub Actions 仅作兜底：清单超过 12 小时未更新时才探测

不需要 git，也不需要 clone 仓库：发布走 GitHub Contents API。

## 准备

1. 在 GitHub 建一个细粒度 token，只授权 `doane2002cn/MoonTV`，权限仅 `Contents: Read and write`
2. 把以下文件放到 NAS 的项目目录（如 `/volume2/others/docker/moontv-local`）：
   - `deploy/nas/source-health-push.sh`
   - `scripts/probe-source-health.mjs`
   - `scripts/publish-source-health.mjs`
3. Node 依赖：宿主有 `node` 直接使用；没有则自动用 `node:20-alpine` 容器（默认 `docker`，可用 `MOONTV_DOCKER` 覆盖）

## 先做一次干跑

```sh
cd /volume2/others/docker/moontv-local
MOONTV_GITHUB_TOKEN='<token>' MOONTV_PUBLISH_DRY_RUN=1 sh deploy/nas/source-health-push.sh
```

看到 `probed 20 sources ...` 和失败源原因即正常，不会提交。去掉 `MOONTV_PUBLISH_DRY_RUN=1` 再跑一次，会生成一条 `chore(source-health): refresh health list (nas)` 提交。

## 定时任务（Synology）

新建 `/volume2/others/docker/moontv-local/.env.health`：

```sh
export MOONTV_GITHUB_TOKEN='<token>'
```

在任务计划或 crontab 里加：

```sh
0 */12 * * * cd /volume2/others/docker/moontv-local && . ./.env.health && sh deploy/nas/source-health-push.sh >> /volume2/others/docker/moontv-health.log 2>&1
```

任务建议以 `root` 运行（Synology 任务计划里可直接选 root），这样容器方式不需要 sudo。若以普通用户运行，把 `MOONTV_DOCKER` 设为 `'sudo -E docker'`。

## 可选环境变量

| 变量                        | 说明                                     |
| --------------------------- | ---------------------------------------- |
| `MOONTV_REPO`               | 默认 `doane2002cn/MoonTV`                |
| `MOONTV_BRANCH`             | 默认 `main`                              |
| `SOURCE_HEALTH_CONFIG`      | 改用本地 config.json，默认从 GitHub 读取 |
| `SOURCE_HEALTH_TIMEOUT_MS`  | 单源超时，默认 12000                     |
| `SOURCE_HEALTH_CONCURRENCY` | 并发数，默认 6                           |
| `MOONTV_PUBLISH_DRY_RUN`    | 设为 1 时只探测不发布                    |
