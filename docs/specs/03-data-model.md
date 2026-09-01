# 数据模型 Spec

## 1. 核心关系

```text
User ──< Session
User ──< ClassMembership >── Classroom
Classroom ──< Student ──< Guardian
Classroom ──< SeatAssignment >── Student
Classroom ──< DutyGroup ──< DutyAssignment >── Student
Classroom ──< CommitteeMember >── Student
Classroom ──< TimetableEntry >── Course
Classroom ──< Exam ──< ExamSubject >── Subject
ExamSubject ──< Score >── Student
Classroom ──< WorkItem
```

## 2. 关键实体

| 实体 | 关键字段 | 约束 |
| --- | --- | --- |
| User | username, passwordHash, displayName, role, status | username 全局唯一 |
| Session | tokenHash, userId, expiresAt | tokenHash 全局唯一；过期即无效 |
| Classroom | name, grade, academicYear, semester, seatRows, seatColumns | name + academicYear 唯一 |
| ClassMembership | userId, classId, role | userId + classId 唯一 |
| Student | classId, studentNo, name, gender, status | classId + studentNo 唯一 |
| Guardian | studentId, name, relationship, phone, isPrimary | 每名学生最多一个主联系人（应用层维护） |
| SeatAssignment | classId, studentId, row, column | 班内 student 唯一；班内 row + column 唯一 |
| DutyGroup | classId, name, weekday, area | classId + name 唯一；weekday 1..7 |
| DutyAssignment | dutyGroupId, studentId | dutyGroupId + studentId 唯一 |
| CommitteeMember | classId, studentId, title | classId + title 唯一 |
| Course | name, color | name 全局唯一 |
| TimetableEntry | classId, courseId, weekday, period | classId + weekday + period 唯一 |
| Exam | classId, name, examDate, status | classId + name 唯一 |
| ExamSubject | examId, subjectId, maxScore, passScore | examId + subjectId 唯一 |
| Score | examSubjectId, studentId, score, absent | examSubjectId + studentId 唯一；absent 时 score 为 null |
| WorkItem | classId, title, dueAt, status, priority | 用于工作台待办 |

## 3. 数据隔离不变量

1. 所有班级业务写入必须从鉴权上下文取得 `classId`，不信任请求体中的同名字段。
2. 跨实体写入时，引用目标必须属于同一班级。例如给座位分配学生前，必须确认 `student.classId === context.classId`。
3. 聚合查询必须带 `classId`；禁止先按全局 id 查询后再在客户端过滤。
4. 删除学生前若存在成绩，默认将学生状态改为 `TRANSFERRED`，保留历史成绩。

## 4. 索引

- `Student(classId, status, name)`：花名册过滤与搜索。
- `Session(tokenHash, expiresAt)`：认证热路径与清理任务。
- `Exam(classId, examDate)`：最近考试。
- `WorkItem(classId, status, dueAt)`：工作台待办。
- 其他唯一约束同时提供主要查询索引。

## 5. 保留与隐私

- 密码只保存 Argon2id 哈希；会话只保存令牌 SHA-256 哈希。
- 监护人电话、学生地址属于个人信息，只在授权页面和 API 中按需返回。
- 退出登录立即删除当前会话；过期会话可由每日任务物理清理。

