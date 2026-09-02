# 架构 Spec

## 1. 总体方案

采用模块化单体。单一部署单元包含 React 页面、Node.js API 和领域服务，MySQL 是唯一持久化数据库。

```text
Browser
  │  HTTPS / HttpOnly session cookie
  ▼
Next.js 16 App Router
  ├─ UI layer        src/app, src/components
  ├─ API layer       src/app/api
  ├─ application     src/server/services
  ├─ domain          src/domain
  └─ infrastructure  src/server/db, Prisma
                         │
                         ▼
                      MySQL 8
```

该结构为首版减少部署和跨服务鉴权成本，同时通过模块边界保留未来拆分成绩分析或通知服务的可能性。

## 2. 技术选型

| 层级 | 选型 | 理由 |
| --- | --- | --- |
| Web/Node | Next.js 16 + TypeScript | 同仓开发、服务端渲染、Route Handler 原生支持 |
| UI | Ant Design 6 | 通用表格、表单、导航和中文本地化完整 |
| ORM | Prisma ORM 7 | 类型安全、迁移与 MySQL 支持成熟 |
| Database | MySQL 8.4 LTS | 符合需求、事务与约束能力完整 |
| Validation | Zod | API 边界运行时校验并复用 TypeScript 类型 |
| Auth | Argon2id + opaque session | 可撤销、服务端可审计，不在浏览器暴露用户声明 |
| Test | Vitest + Testing Library + Playwright | 单元、组件、集成和端到端覆盖 |

## 3. 模块边界

```text
auth        用户、会话、班级成员关系
students    学生与监护人
seating     座位布局与分配规则
duties      值日组与成员
grades      考试、科目、成绩与统计
committee   班委职务
timetable   课程与课表节次
dashboard   只读聚合，不拥有业务数据
```

- `dashboard` 只能读取其他模块，不反向被依赖。
- `grades` 通过 `studentId` 引用学生，不复制姓名。
- `seating`、`duties`、`committee` 在学生转出时保留历史，由应用层决定当前视图是否展示。
- 删除默认采用业务约束或软状态变更；考试等有历史意义的数据不做级联物理删除。

## 4. 请求链路

1. Route Handler 解析请求并用 Zod 校验。
2. `getAuthContext()` 验证 Cookie、会话有效期、用户状态和班级成员关系。
3. 应用服务执行领域规则和事务。
4. Repository/Prisma 访问 MySQL。
5. 返回统一 `ApiResponse<T>`；异常映射为稳定错误码。

## 5. 认证与安全

- 登录成功后生成 32 字节随机令牌；浏览器保存明文令牌，数据库仅保存 SHA-256 哈希。
- 密码使用 Argon2id；种子账号首次部署后必须修改默认密码。
- 登录接口按用户名/IP 预留限流扩展点；首版不把“账号不存在”和“密码错误”区分返回。
- 修改请求校验 `Origin` 与 Host（同源）；Cookie 为 `SameSite=Lax`。
- 查询必须同时包含业务主键与授权后的 `classId`，避免 IDOR。
- 日志脱敏手机号、Cookie、密码和会话令牌。

## 6. 数据一致性

- 批量座位、值日、课程表和成绩写入使用事务。
- 唯一约束作为最终并发防线；领域验证用于返回友好错误。
- 金额不存在；成绩使用 `Decimal(5,2)`，避免二进制浮点持久化偏差。
- 日期类字段使用 UTC `DateTime`；课表星期与节次使用整数枚举语义。

## 7. 部署拓扑

开发环境由 `docker compose` 启动 MySQL，应用通过本地 Node.js 启动。生产环境至少包含：一个 Next.js Node 进程、一个 MySQL 8 实例、反向代理/TLS 和每日备份。应用实例扩容时会话仍在 MySQL 中，无需粘性会话。

## 8. 演进策略

- v0.2：CSV/Excel 批量导入、审计日志页面、任课教师细粒度权限。
- v0.3：家长端、消息通知、请假与德育量化。
- 只有当独立扩缩容或团队边界出现时，才从模块化单体拆服务。
