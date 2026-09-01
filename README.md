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

项目提供基于 SSH、PM2 和 release 符号链接的部署脚本，适用于宝塔或普通 Linux 主机。服务器需要准备 Node.js/npm、PM2、可访问的 MySQL，以及由反向代理/TLS 暴露的域名。

```bash
cp deploy.env.example deploy.env
# 编辑 deploy.env，至少填写 DEPLOY_TARGET，并在服务器创建 DEPLOY_ENV_PATH 指向的 .env
npm run deploy
```

发布前会运行本地生产构建、ESLint、类型检查和单元测试；服务器上会重新执行 `npm ci`、`npm run build`、Prisma 迁移和 `pm2` 启动，并请求 `/api/health` 验证新版本。成功版本位于 `<DEPLOY_PATH>/.deploy/releases/`，`<DEPLOY_PATH>/current` 始终指向当前版本，健康检查失败会恢复旧版本。

默认允许 SSH 交互式密码登录；使用密钥自动化时可加 `--batch-mode`。如果 SSH 需要通过本机 SOCKS5 代理，可设置代理命令：

```bash
DEPLOY_PROXY_COMMAND='nc -x 127.0.0.1:7897 -X 5 %h %p' npm run deploy
```

常用选项：

```bash
npm run deploy -- --dry-run --skip-build       # 检查 SSH 并生成包，不上传、不发布
npm run deploy -- --skip-checks                # 跳过本地 lint、类型检查和单元测试
npm run deploy -- --skip-migrations            # 不在服务器执行 Prisma 生产迁移
npm run deploy -- --batch-mode                 # 仅使用 SSH 密钥，不提示输入密码
```

运行时 `.env`、SSH 私钥和数据库凭据不会进入发布包；`deploy.env` 已被 Git 忽略。首次部署前请确认服务器上的 `.env` 已配置正确，并在反向代理中只将公网流量转发到 PM2 监听的本机端口。

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
npm run test:deploy     # 使用伪造 SSH/PM2 的部署流程测试
npm run db:generate     # 生成 Prisma Client
npm run db:migrate      # 创建新的开发迁移（需要数据库建库权限）
npm run db:deploy       # 应用已提交迁移（初始化/生产推荐）
npm run db:seed         # 重置并写入演示数据
npm run db:studio       # Prisma 数据浏览器
```

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

首版不包含学生/家长自助端、消息通知、请假审批、文件导入导出和排课算法。后续演进方向记录在 [架构 Spec](./docs/specs/02-architecture.md)。
