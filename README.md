# 班主任工作台

面向高中班主任的一站式班级日常管理系统。首版包含登录、工作台、座次表、值日表、成绩分析、花名册、班委名单、家长通讯录和课程表，所有业务数据持久化到 MySQL。

## 技术架构

- Next.js 16 + React 19 + TypeScript：React 前端与 Node.js Route Handlers
- Ant Design 6：通用 UI 与中文界面
- MySQL 8.4 + Prisma ORM 7：关系数据、迁移和事务
- Argon2id + HttpOnly Cookie：密码与服务端会话认证
- Vitest + Testing Library + Playwright：单元、组件和端到端测试

架构、数据模型和接口契约以 [Spec 索引](./docs/specs/README.md) 为基线。需求变更应先更新 Spec 和验收用例。

## 快速开始

### 1. 安装依赖

```bash
npm install
cp .env.example .env
```

### 2. 启动 MySQL

推荐使用 Docker：

```bash
docker compose up -d
```

默认把容器的 MySQL 映射到本机 `3307`，避免与已有的 `3306` 冲突。若使用本机 MySQL，请先创建数据库和账号，再修改 `.env` 中的 `DATABASE_URL`。

### 3. 初始化数据

```bash
npm run db:deploy
npm run db:seed
```

种子数据包含一个完整的高二班级、24 名虚构学生、家长联系人、座次、过道、窗户和门口标记、值日、班委、课程表、考试成绩和工作台待办。

座次表支持打印当前座位图（黑白版），也可导出包含座位矩阵和学生安排状态的 Excel 文件。

演示登录：

```text
管理员：admin / admin123
班主任：teacher / Teacher@123
```

### 4. 启动应用

```bash
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。

### 5. 部署到自有 Node.js 服务器

项目提供基于 SSH 的源码发布脚本，支持 PM2 release 符号链接或已配置好的 systemd 服务，适用于宝塔或普通 Linux 主机。服务器需要准备与锁文件兼容的 Node.js/npm、可访问的 MySQL，以及由反向代理/TLS 暴露的域名。

```bash
cp deploy.env.example deploy.env
# 编辑 deploy.env，至少填写 DEPLOY_TARGET 和 DEPLOY_KNOWN_HOSTS_FILE。
# 在服务器创建 DEPLOY_ENV_PATH 指向的运行时 .env；该文件不会上传。
npm run deploy
```

传统 SSH 发布包只包含源码和构建所需配置，绝不包含本机的 `.next` 或 `node_modules`；服务器会在 Linux 环境中完成构建。GitHub Actions CI/CD 使用 Linux runner 生成 standalone 发布包，服务器只接收已经验证的生产产物，因此适合内存较小的生产主机。

PM2 模式通过 `<DEPLOY_PATH>/current` 指向新 release。systemd 模式会先在 `<DEPLOY_PATH>/.deploy/releases/` 完成上述所有步骤，随后才停止服务、把原 `DEPLOY_APP_PATH` 整目录移入 `rollback-<release>`、切换新目录、启动服务并执行健康检查；旧目录自己的 `node_modules` 因此可用于应用目录回滚。

目录回滚不能撤销已执行的数据库迁移。生产迁移必须保持向后兼容，并配合数据库备份和单独的数据库回滚方案；`--skip-migrations` 只能用于已经由其他受控流程完成迁移的发布。

`DEPLOY_KNOWN_HOSTS_FILE` 是必填项。脚本使用 `StrictHostKeyChecking=yes`，只读取该固定文件且不会接受或写入首次连接的主机密钥。首次部署前，请通过独立可信渠道核验服务器 SSH 主机密钥指纹，再把已核验的条目写入该文件。默认允许 SSH 交互式密码登录；使用密钥自动化时可加 `--batch-mode`。如果 SSH 需要通过本机 SOCKS5 代理，可设置代理命令：

```bash
DEPLOY_PROXY_COMMAND='nc -x 127.0.0.1:7897 -X 5 %h %p' npm run deploy
```

常用选项：

```bash
npm run deploy -- --dry-run                    # 检查 SSH 并生成源码包，不上传、不发布
npm run deploy -- --skip-checks                # 跳过本地 lint、类型检查和单元测试
npm run deploy -- --skip-migrations            # 不在服务器执行 Prisma 生产迁移
npm run deploy -- --batch-mode                 # 仅使用 SSH 密钥，不提示输入密码

# 已配置 systemd 服务时：
DEPLOY_RUNTIME=systemd npm run deploy
```

systemd 首次部署前，先创建服务单元和稳定的运行时 `.env`。`DEPLOY_APP_PATH` 可以尚不存在，但 `DEPLOY_ENV_PATH` 必须位于其外部且物理路径仍在 `DEPLOY_PATH` 内；脚本会解析符号链接并拒绝逃出部署目录的应用父目录或 `.env`。systemd 模式默认使用 `<DEPLOY_PATH>/.deploy/runtime.env`。例如：

```ini
# /etc/systemd/system/school-next.service
[Unit]
Description=School Next.js service
After=network-online.target
Wants=network-online.target

[Service]
User=www
Group=www
WorkingDirectory=/www/wwwroot/school.19soul.cn/school
Environment=NODE_ENV=production
EnvironmentFile=/www/wwwroot/school.19soul.cn/.deploy/runtime.env
Environment=HOSTNAME=127.0.0.1
Environment=PORT=3000
ExecStart=/usr/local/bin/node /www/wwwroot/school.19soul.cn/school/.next/standalone/server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
install -d -m 750 -o school -g school /www/wwwroot/school.19soul.cn/.deploy
install -m 600 -o school -g school /path/to/school.env /www/wwwroot/school.19soul.cn/.deploy/runtime.env
systemctl daemon-reload
systemctl enable school-next.service
systemctl restart school-next.service
```

`deploy/school-next.service` 是与 CI/CD standalone 发布方式匹配的服务单元模板。首次切换前请确认服务器上的 `WorkingDirectory`、`EnvironmentFile` 和 `ExecStart` 与模板一致。

SSH 发布账号必须能够写入 `<DEPLOY_PATH>/.deploy`、重命名 `DEPLOY_APP_PATH`、读取运行时 `.env` 完成构建，并执行该服务的 `systemctl show`、`stop` 和 `start`；脚本还会将新目录 `chown` 到 systemd 单元的 `User`/`Group`。通常让发布账号与服务账号一致；若不同，发布账号需要受限的 `chown` 权限，以及仅限该服务的非交互式 systemd 权限。运行时 `.env`、SSH 私钥和数据库凭据不会进入发布包；`deploy.env` 已被 Git 忽略。首次部署前请确认服务器上的 `.env` 已配置正确，并在反向代理中只将公网流量转发到应用监听的本机端口。

## 常用命令

```bash
npm run dev             # 开发服务器
npm run build           # 生产构建
npm run start           # 启动生产构建
npm run lint            # ESLint
npm run typecheck       # TypeScript 类型检查
npm test                # 单元测试
npm run test:coverage   # 覆盖率报告（阈值 80%）
npm run test:e2e        # Playwright 关键流程测试
npm run test:package    # 发布包内容和秘密文件排除测试
npm run test:package:standalone # CI standalone 发布包测试
npm run test:deploy     # 使用伪造 SSH/PM2 的部署流程测试
npm run test:deploy:systemd # systemd 远端构建和切换测试
npm run test:deploy:standalone # standalone 远端切换和回滚测试
npm run package:standalone # 打包已构建的 standalone 产物
npm run db:generate     # 生成 Prisma Client
npm run db:migrate      # 创建新的开发迁移（需要数据库建库权限）
npm run db:deploy       # 应用已提交迁移（初始化/生产推荐）
npm run db:seed         # 重置并写入演示数据
npm run db:studio       # Prisma 数据浏览器
```

## GitHub Actions CI/CD

仓库包含 `.github/workflows/ci-cd.yml`。Pull Request 只执行检查和 Linux standalone 构建；推送到 `main` 后，工作流会在验证和构建通过后立即把同一份 Linux 构建包发布到生产服务器。连续提交时，GitHub Actions 会取消旧运行，只保留最新提交。

普通发布只执行兼容的 Prisma 生产迁移，不会上传本地 `.env` 或覆盖数据库。远端 systemd 服务需要使用 `.next/standalone/server.js`，并预置可执行的 Prisma CLI。

在 GitHub 的 `production` Environment 中配置：

```text
Secret: SCHOOL_DEPLOY_SSH_KEY       # 服务器 authorized_keys 对应的私钥
Secret: SCHOOL_DEPLOY_KNOWN_HOSTS   # 已核验的 39.106.46.229 主机密钥
Variable: SCHOOL_DEPLOY_TARGET      # 默认 root@39.106.46.229
Variable: SCHOOL_DEPLOY_PRISMA_BIN  # 默认 /www/wwwroot/school.19soul.cn/.deploy/runtime-node_modules/.bin/prisma
```

其余路径变量有与当前服务器匹配的默认值，可按环境覆盖。生产数据库导入应使用单独的人工确认流程，先备份再恢复，不应绑定到每次代码推送。

首次运行 E2E 前安装 Chromium：

```bash
npx playwright install chromium
```

## 目录结构

```text
docs/specs/                  产品、架构、数据模型、API 与验收 Spec
prisma/
  migrations/               MySQL 初始化迁移
  schema.prisma             领域数据模型
  seed.ts                   可重复执行的虚构演示数据
src/
  app/                      页面和 REST Route Handlers
  components/               布局与通用 UI
  domain/                   无框架依赖的领域规则
  generated/prisma/         生成的类型安全数据库客户端
  hooks/                    前端数据获取 Hook
  lib/                      浏览器 API 客户端
  server/                   认证、校验、服务和数据库基础设施
e2e/                        Playwright 用户旅程
```

## 安全说明

- 密码使用 Argon2id 哈希；数据库不保存明文密码。
- 登录令牌由 32 字节随机数生成，浏览器仅通过 HttpOnly Cookie 持有；数据库只保存 SHA-256 哈希。
- 业务 API 从已验证的会话推导 `classId`，不信任客户端提交的班级标识。
- 家长电话和学生地址只由有班级权限的会话读取。
- `.env`、真实学生信息和数据库凭据不得提交到版本库。
- 演示账号只用于本地初始化，部署后必须修改默认密码。

## 当前边界

首版不包含学生/家长自助端、消息通知、请假审批、文件批量导入和排课算法。后续演进方向记录在 [架构 Spec](./docs/specs/02-architecture.md)。
