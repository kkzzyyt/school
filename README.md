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
管理员：admin / 123456
班主任：mx / 123456
```

`123456` 仅用于初始化演示，部署后请立即通过用户管理或其他安全流程修改密码。

新用户可从登录页进入“立即注册”提交申请。注册账号默认进入待审核状态，管理员登录后在 `/admin/users` 审核申请、分配默认班级并开通账号。只有管理员可以进入用户管理界面；管理员也可以直接新增、停用、重置密码和撤销用户会话。管理员新增用户时无需填写密码，系统会使用初始密码 `123456`，并要求选择班级。

### 4. 启动应用

```bash
npm run dev
```

浏览器访问 [http://localhost:3000](http://localhost:3000)。

### 5. Docker 生产部署

线上生产入口使用 GitHub Actions：Linux runner 在固定的 Docker 构建环境中完成依赖安装和 Next.js standalone 构建，先运行镜像健康路由冒烟测试，再生成带 SHA-256 校验的 Docker 镜像包。部署时通过 SSH 上传镜像包、校验文件和 Compose 配置，服务器使用 `docker load` 导入镜像，不依赖生产机访问 GHCR。服务器只需要 Docker Engine、Docker Compose v2、可访问的 MySQL 和反向代理/TLS，不再需要与本机匹配的 Node.js、npm 或 Prisma CLI。

首次部署前，在服务器创建不会上传的运行时环境文件，并确保 SSH 发布账号可以读取它、执行 Docker 命令（通常加入 `docker` 用户组或使用 root）：

```bash
install -d -m 750 /www/wwwroot/school.19soul.cn/.deploy
install -m 600 /path/to/school.env /www/wwwroot/school.19soul.cn/.deploy/runtime.env
```

`docker-compose.production.yml` 使用 Linux host network，让现有主机 MySQL 的 `127.0.0.1:3306` 仍可从应用容器访问；应用只监听主机 `127.0.0.1:3000`，反向代理应转发到该地址，不要把应用端口直接暴露到公网。如果数据库在另一个容器或独立主机，需把 `DATABASE_URL` 改成容器/主机可达的地址，并按实际网络调整 Compose 配置。

在 GitHub 的 `production` Environment 中配置好 SSH 密钥和变量后，推送到 `main` 或手动运行 workflow 即可发布。部署脚本会校验镜像包、在容器内执行 Prisma 配置校验和生产迁移，启动后先确认运行中的容器确实使用本次镜像，再执行健康检查；任一步失败都会自动恢复上一份 Docker release。数据库迁移本身不会随目录回滚，生产迁移必须保持向后兼容并配合备份。

旧版 `npm run deploy` 的 PM2/systemd 源码发布脚本仍保留作兼容和人工回退使用，但它会依赖服务器本机 Node.js/npm，不是当前 GitHub Actions 的生产入口。

如果 SSH 需要通过本机 SOCKS5 代理，可在 workflow 的 SSH 配置中设置对应代理命令；固定 `known_hosts` 仍必须通过独立可信渠道核验，发布流程始终使用 `StrictHostKeyChecking=yes`。

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
npm run test:standalone:runtime # standalone 构建产物运行时冒烟测试
npm run test:docker:config # Dockerfile、Compose 和忽略规则测试
npm run test:docker:runtime # Docker 镜像运行时冒烟测试
npm run test:deploy     # 使用伪造 SSH/PM2 的部署流程测试
npm run test:deploy:systemd # systemd 远端构建和切换测试
npm run test:deploy:standalone # standalone 远端切换和回滚测试
npm run test:deploy:docker # Docker 镜像远端切换和回滚测试
npm run test:deploy:docker:registry # GHCR 镜像远端切换、校验和回滚测试
npm run package:standalone # 打包已构建的 standalone 产物
npm run db:generate     # 生成 Prisma Client
npm run db:migrate      # 创建新的开发迁移（需要数据库建库权限）
npm run db:deploy       # 应用已提交迁移（初始化/生产推荐）
npm run db:sync:student-gender # 将 OTHER 且可由姓名明确推断的性别同步到 Student.gender
npm run db:seed         # 重置并写入演示数据
npm run db:studio       # Prisma 数据浏览器
```

## GitHub Actions CI/CD

仓库包含 `.github/workflows/ci-cd.yml`。Pull Request、push 和手动运行都会在 Linux runner 中构建同一套 `linux/amd64` Docker 镜像并运行冒烟测试；需要部署时，验证通过的镜像会打包为带校验文件的 artifact，再通过 SSH 上传到生产服务器。连续提交时，GitHub Actions 会取消旧运行，只保留最新提交。

Docker 镜像包含 Next.js standalone 运行时、MariaDB Prisma 适配器和生产迁移所需的 Prisma CLI；生产服务器不参与 npm 安装或 Next.js 构建。生产部署产物包含镜像 `.tar.gz`、对应 `.sha256` 校验文件和 `docker-compose.production.yml`，不会上传本地 `.env` 或覆盖数据库。发布脚本只从服务器上的 `DEPLOY_ENV_PATH` 读取运行时配置，在加载镜像后执行 Prisma 校验、迁移，随后校验活动镜像和 `/api/health` 数据库健康检查；切换失败会恢复旧容器和 `current` release 指针。

在 GitHub 的 `production` Environment 中配置：

```text
Secret: SCHOOL_DEPLOY_SSH_KEY       # 服务器 authorized_keys 对应的私钥
Secret: SCHOOL_DEPLOY_KNOWN_HOSTS   # 已核验的 39.106.46.229 主机密钥
Variable: SCHOOL_DEPLOY_TARGET      # 默认 root@39.106.46.229
Variable: SCHOOL_DEPLOY_COMPOSE_PROJECT # 默认 school
Variable: SCHOOL_DEPLOY_LEGACY_SERVICE  # 默认 school-next.service；首次 Docker 发布时停止旧 systemd
```

其余路径变量有与当前服务器匹配的默认值，可按环境覆盖。生产数据库导入应使用单独的人工确认流程，先备份再恢复，不应绑定到每次代码推送。

首次运行 E2E 前安装 Chromium：

```bash
npx playwright install chromium
```

## 目录结构

```text
Dockerfile                   Linux 多阶段生产镜像
docker-compose.production.yml Docker 生产运行与健康检查配置
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
- 注册账号先保存为 `PENDING`，管理员批准并分配班级后才能登录；公开注册不能申请管理员角色。
- 停用账号或重置密码会立即撤销该账号的全部会话；用户管理操作会写入审计日志。
- 业务 API 从已验证的会话推导 `classId`，不信任客户端提交的班级标识。
- 家长电话和学生地址只由有班级权限的会话读取。
- `.env`、真实学生信息和数据库凭据不得提交到版本库。
- 演示账号只用于本地初始化，部署后必须修改默认密码。

## 当前边界

首版不包含学生/家长自助端、消息通知、请假审批、文件批量导入和排课算法。后续演进方向记录在 [架构 Spec](./docs/specs/02-architecture.md)。
