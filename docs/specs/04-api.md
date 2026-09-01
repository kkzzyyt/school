# REST API Spec

## 1. 通用约定

基础路径：`/api`。除登录和健康检查外，所有接口需要有效会话。

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

标准状态码：`400` 参数错误，`401` 未登录/会话过期，`403` 无班级权限，`404` 资源不存在，`409` 唯一约束冲突，`500` 未预期错误。

## 2. 认证

| Method | Path | Body / 说明 |
| --- | --- | --- |
| POST | `/api/auth/login` | `{ username, password }`；设置会话 Cookie |
| POST | `/api/auth/logout` | 删除当前会话与 Cookie |
| GET | `/api/auth/me` | 当前用户、可访问班级和当前班级 |

## 3. 工作台

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/dashboard` | 学生统计、今日课程/值日、待办、最近考试 |

## 4. 学生与通讯录

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

## 5. 座次和值日

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/seating` | 布局尺寸、学生、当前分配和左右侧教室标记 |
| PUT | `/api/seating` | `{ rows, columns, assignments[], environment }` 原子替换座次与教室标记 |
| GET | `/api/duties` | 值日组与成员 |
| POST | `/api/duties` | 新增值日组 |
| PATCH | `/api/duties/:id` | 更新组信息和成员 |
| DELETE | `/api/duties/:id` | 删除值日组 |

## 6. 班委和课表

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/committee` | 班委列表 |
| PUT | `/api/committee` | 原子替换班委列表 |
| GET | `/api/timetable` | 课程字典和课表 |
| PUT | `/api/timetable` | 原子替换课表节次 |

## 7. 考试与成绩

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/api/exams` | 考试列表 |
| POST | `/api/exams` | 创建考试及考试科目 |
| GET | `/api/exams/:id/analysis` | 科目统计、总分排行和覆盖率 |
| PUT | `/api/exams/:id/scores` | 批量 upsert 成绩 |

## 8. 并发与幂等

- 原子替换接口在事务内先验证完整载荷，再执行写入。
- 更新接口接受 `updatedAt`；与当前值不一致时返回 `409 STALE_WRITE`。
- POST 创建接口可在后续通过 `Idempotency-Key` 扩展；首版 UI 提交期间禁用按钮防止重复提交。
