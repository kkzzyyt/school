# 生产发布排查手册

最后更新：`2026-09-04`

本文记录生产 Docker 发布的核验顺序，以及 2026-09-04 发生的一次“CI 构建成功但线上仍是旧版本”事件。文档不记录 SSH 密码、私钥或运行时 `.env` 内容。

## 发布完成的判定

CI 显示成功只代表镜像和 release 已构建完成。生产发布还必须同时满足以下条件：

1. `docker inspect` 显示运行中的 `app` 容器使用本次提交对应的镜像 revision。
2. `.deploy/docker/current` 指向本次 release。
3. Docker Compose 项目使用本次 release 的 Compose 文件完成容器重建。
4. `http://127.0.0.1:3000/api/health` 返回成功，且公网页面能看到本次版本标识。

推荐使用 SSH 别名连接服务器，避免把密码、私钥和主机配置写进命令或仓库：

```bash
ssh school-server
```

## 2026-09-04 事件记录

### 现象

提交 `1d5ea39` 已推送到 `origin/main`，CI 也生成了对应的 release，但公网登录页仍显示旧版“智教办公系统”。

### 根因

服务器上同时存在两条 release 链：

- CI release：`ci-1d5ea394c5b7-33856878078`
- 当前运行 release：`manual-7cfd433-v2`

CI 产出的镜像已存在于服务器本地，但运行中的 `school-app-1` 仍使用旧镜像 `ghcr.io/kkzzyyt/school:7cfd433...`。因此构建结果没有完成最后的容器切换。

### 处理结果

按 Docker Compose release 流程完成了以下操作：

1. 校验目标 Compose 配置和 Prisma 配置。
2. 执行 `prisma migrate deploy`。
3. 使用目标镜像强制重建 `school-app-1`。
4. 等待本机健康检查成功。
5. 校验活动镜像为 `school:1d5ea394c5b719f9e2a4bbc2bb9d952a12252528`。
6. 将 `.deploy/docker/current` 原子切换到目标 CI release。
7. 通过公网登录页版本标识确认外部流量已到达新容器。

旧 release 保留在服务器上，可用于故障回退。数据库迁移不会自动回滚，迁移必须保持向后兼容。

## 线上仍是旧版本时的排查顺序

```bash
base=/www/wwwroot/school.19soul.cn
state="$base/.deploy/docker"

readlink -f "$state/current"
docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}'
docker inspect school-app-1 --format '{{.Config.Image}}|{{json .Config.Labels}}'
curl -fsS http://127.0.0.1:3000/api/health
```

重点比较：

- `docker inspect` 的 `org.opencontainers.image.revision` 是否等于目标提交 SHA。
- `com.docker.compose.project.config_files` 是否来自目标 release。
- `readlink -f "$state/current"` 是否指向目标 release。
- 健康检查是否成功；成功只说明服务可用，不代表版本正确。

如果目标镜像已经存在但容器仍是旧镜像，应使用目标 release 的 Compose 文件执行 `up --detach --no-deps --force-recreate app`，健康检查成功后再更新 `current` 指针。若健康检查失败，立即使用旧 release 的 Compose 文件重建容器，并保留旧 `current` 指针。

## 预防措施

- CI 发布步骤必须在容器启动后校验活动镜像，而不是只校验镜像上传或导入成功。
- 生产验证同时检查镜像 revision、Compose 文件路径、current 指针和健康路由。
- 手工发布不得把新的 release 指针留在 `manual-*`，除非这是明确的回退操作。
- 继续使用固定 `known_hosts` 和 `StrictHostKeyChecking=yes`；生产 SSH 凭据只放在 GitHub Environment 或服务器授权配置中。
- 发现 Prisma OpenSSL fallback 警告时，应在后续镜像中补齐 OpenSSL 运行依赖，并再次执行 Docker 运行时冒烟测试。
