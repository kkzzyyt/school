# 班主任工作台 Spec 索引

状态：`v0.1 / 已批准进入实现`  
最后更新：`2026-09-01`

本目录是首版产品与工程实现的唯一需求基线。需求变更时，先更新对应 Spec 与验收用例，再修改代码。

| 文档 | 说明 |
| --- | --- |
| [01-product.md](./01-product.md) | 产品目标、角色、范围、用户旅程与非目标 |
| [02-architecture.md](./02-architecture.md) | 系统架构、模块边界、安全与质量属性 |
| [03-data-model.md](./03-data-model.md) | MySQL 领域模型、约束与数据隔离规则 |
| [04-api.md](./04-api.md) | REST API 契约、错误码与鉴权规则 |
| [05-acceptance.md](./05-acceptance.md) | 功能验收、测试门槛与发布定义 |

## 决策摘要

- 模块化单体：Next.js App Router 同时承载 React 前端和 Node.js Route Handlers。
- 数据层：MySQL 8 + Prisma ORM 7；所有班级业务表强制携带 `classId`。
- UI：Ant Design 6，桌面端优先并适配平板和手机。
- 登录：用户名/密码 + 随机不透明会话令牌；浏览器只保存 HttpOnly Cookie，服务端仅保存令牌哈希。
- 首版角色：系统管理员、班主任；任课教师作为下一阶段扩展角色保留。
- 质量门槛：核心领域逻辑覆盖率不低于 80%，认证关键流程具备集成测试和 E2E 测试。

