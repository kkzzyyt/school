# REST API Spec

## 1. 通用约定

基础路径：`/api`。注册、登录和健康检查可匿名访问；用户管理接口需要 `ADMIN` 会话，其余业务接口需要有效会话。

成功响应：

```json
{ "success": true, "data": {} }
```

失败响应：

```json
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "请求参数不正确" },
  "requestId": "..."
}
```

标准状态码：`400` 参数错误，`401` 未登录/会话过期，`403` 角色或班级权限不足，`404` 资源不存在，`409` 唯一约束冲突，`500` 未预期错误。

## 2. 认证

| Method | Path | Body / 说明 |
| --- | --- | --- |
| POST | `/api/auth/register` | `{ username, displayName, password, confirmPassword }`；创建 `PENDING` 账号，不创建会话 |
| POST | `/api/auth/login` | `{ username, password }`；设置会话 Cookie |
| POST | `/api/auth/logout` | 删除当前会话与 Cookie |
| GET | `/api/auth/me` | 当前用户、可访问班级和当前班级 |

## 3. 用户管理（仅管理员）

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/admin/classrooms` | 返回可分配的班级摘要 |
| GET | `/api/admin/users?q=&status=&role=&page=&pageSize=` | 分页返回用户，不返回密码哈希和会话令牌 |
| POST | `/api/admin/users` | 创建启用中的用户，可设置角色和默认班级；密码由服务端统一初始化为 `123456` |
| PATCH | `/api/admin/users/:id` | 更新姓名、角色、状态和默认班级 |
| POST | `/api/admin/users/:id/reset-password` | 设置新密码并撤销目标用户全部会话 |
| POST | `/api/admin/users/:id/revoke-sessions` | 撤销目标用户全部会话 |

## 4. 工作台

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/dashboard` | 学生统计、今日课程/值日、待办、最近考试 |

## 5. 学生与通讯录

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/students?q=&status=&page=&pageSize=` | 分页花名册 |
| POST | `/api/students` | 新增学生 |
| PATCH | `/api/students/:id` | 更新学生 |
| DELETE | `/api/students/:id` | 无历史记录时删除，否则转为 `TRANSFERRED` |
| GET | `/api/students/:id/guardians` | 监护人列表 |
| POST | `/api/students/:id/guardians` | 新增监护人 |
| PATCH | `/api/guardians/:id` | 更新监护人 |
| DELETE | `/api/guardians/:id` | 删除监护人 |

## 6. 座次和值日

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/seating` | 布局尺寸、学生、当前分配、教室环境和 `revision`；座位行列不包含过道或左右侧轨道 |
| PUT | `/api/seating` | `{ revision, rows, columns, assignments[], environment }` 原子替换座次与教室标记 |
| GET | `/api/duties` | 值日组与成员 |
| POST | `/api/duties` | 新增值日组 |
| PATCH | `/api/duties/:id` | 更新组信息和成员 |
| DELETE | `/api/duties/:id` | 删除值日组 |

`environment` 的完整结构为：

```json
{
  "aisleAfterColumns": [2, 6],
  "left": { "windows": [1, 2], "doorRows": [] },
  "right": { "windows": [], "doorRows": [7] },
  "rear": { "waterDispenser": null, "airConditioner": null }
}
```

- `aisleAfterColumns` 表示在第几列座位之后插入过道，不占用也不减少座位列；过道位置独立于排数、列数和左右侧轨道。
- 默认教室为 `2 | 4 | 2`：8 列座位，在第 2、6 列后插入两条过道。
- 左右侧轨道固定为 7 个标记位。窗户和门口使用从 `1` 开始的轨道排号；每侧最多两个门口，且同一位置只能设置一种标记。
- `rear` 和 `fixedFacilities` 仅作为历史数据兼容字段保留；当前页面不展示、不编辑饮水机和空调，已有字段保存时原样保留，页面不会主动设置设施位置。
- 为兼容旧客户端与既有 JSON，服务端会把 `aisleColumns` 和单一 `doorRow` 归一化为 `aisleAfterColumns` 和 `doorRows`；PUT 也可以省略 `environment`。
- PUT 必须回传 GET 给出的 `revision`。revision 已过期时返回 `409 STALE_WRITE`，不会删除当前座次。

## 7. 班委和课表

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/committee` | 班委列表 |
| PUT | `/api/committee` | 原子替换班委列表 |
| GET | `/api/timetable` | 课程字典和课表 |
| PUT | `/api/timetable` | 原子替换课表节次 |

## 8. 考试与成绩

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/exams` | 考试列表 |
| POST | `/api/exams` | 创建考试及考试科目 |
| GET | `/api/exams/:id/analysis` | 科目统计、总分排行和覆盖率 |
| PUT | `/api/exams/:id/scores` | 批量 upsert 成绩 |

## 9. 并发与幂等

- 原子替换接口在事务内先验证完整载荷，再执行写入。
- 座次完整替换接口使用 GET 返回的 `revision`；与当前版本不一致时返回 `409 STALE_WRITE`。
- POST 创建接口可在后续通过 `Idempotency-Key` 扩展；首版 UI 提交期间禁用按钮防止重复提交。
