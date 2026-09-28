# 座位图智能导入设计

状态：`v0.2 / 结构化导入与首版图片 OCR 已实现`

当前实现采用独立的自托管 PaddleOCR 适配器，支持带有明确行列标记的 PNG、JPEG 和 WebP 座位图。OCR 识别后返回文字、可信度与坐标，教师可重新匹配学生并确认原图；缺少行列标记的图片会提示布局不确定，暂不自动应用。服务启动与资源限制见 [OCR 服务说明](../../ocr-service/README.md)。

## 1. 设计结论

“导入座位图”包含两个不同任务：

1. 从一张文件或图片中还原当前座位布局。
2. 从多张历史座位图中推断座位轮换规律。

两者使用同一条数据管线，但需要不同的样本和提示。单张图可以识别布局，多张历史图才能支持时间规律推断。

首期使用混合方案：结构化文件使用确定性解析，图片和 PDF 使用 OCR/视觉识别，规律使用现有轮换方案进行候选匹配。所有结果先进入导入草稿，经过服务端校验和教师确认后才应用。

## 2. 场景与版本范围

| 场景 | 输入 | 输出 | 版本 |
| --- | --- | --- | --- |
| 导入系统导出的座位表 | `.xlsx` | 座位草稿、学生匹配结果 | 首期 |
| 导入普通 Excel/CSV | `.xlsx`、`.csv` | 标准化座位草稿、冲突列表 | 首期 |
| 导入截图或 PDF | 图片、PDF | OCR 网格、逐格修正界面 | 第二期 |
| 推断轮换规律 | 两张以上历史快照 | 规则候选、匹配率、差异学生 | 首期 |
| 自动生成新座次 | 学生属性、约束、偏好 | 新座位方案 | 第三期 |

首期交付重点是“可确认的结构化导入”和“可解释的历史规律推荐”。自动生成座次需要独立的约束优化设计，暂不和导入流程绑定。

## 3. 当前基础

现有座次模块已经提供：

- `SeatAssignment` 的 `row / column` 坐标。
- 班级级的行数、列数和座位环境。
- 过道、门窗、固定设施、禁用座位和锁定座位。
- `SeatingHistory` 历史快照、差异计算和恢复能力。
- `seating-rotation.ts` 中的前后移动、大组循环、镜像和自定义列映射。
- `validateSeatingLayout`、`validateSeatingEnvironment` 等服务端领域校验。

导入功能应建立在这些能力上，导入结果不能绕过现有校验直接写入数据库。

## 4. 用户流程

```mermaid
flowchart LR
  A[选择文件] --> B[识别格式]
  B --> C[生成导入草稿]
  C --> D[匹配班级学生]
  D --> E[校验布局和环境]
  E --> F[查看差异和冲突]
  F --> G[选择规律候选]
  G --> H[确认应用]
  H --> I[事务保存并写入历史]
```

页面使用一个“导入座位图”弹窗，分为五步：

1. **选择文件**：显示支持的格式、大小限制和当前班级。
2. **识别结果**：展示行数、列数、方向、过道和座位网格。
3. **学生匹配**：展示已匹配、候选匹配、未匹配、重复和班级外记录。
4. **规律建议**：有历史快照时显示候选规律；没有历史快照时隐藏该步骤。
5. **确认应用**：显示当前座次与导入结果的差异，确认后提交。

应用按钮必须满足以下条件：

- 没有重复学生和重复座位。
- 所有已填充单元格都能匹配到当前班级学生。
- 没有越界、过道、禁用座位和锁定座位冲突。
- 行列方向和过道位置已经确认。

不满足条件时允许保存草稿和继续编辑，应用按钮保持禁用，并展示修复入口。

## 5. 导入管线

### 5.1 文件适配器

不同来源先转换成统一的 `RawSeatGrid`，后续流程不关心文件类型：

```ts
interface RawSeatGrid {
  sourceType: "XLSX" | "CSV" | "IMAGE" | "PDF";
  rows: Array<Array<{
    text: string;
    rowIndex: number;
    columnIndex: number;
    isEmpty: boolean;
    confidence?: number;
  }>>;
  hints: {
    rowCount?: number;
    columnCount?: number;
    aisleColumns?: number[];
    orientation?: "FRONT_TOP" | "FRONT_BOTTOM" | "UNKNOWN";
  };
}
```

Excel/CSV 解析优先使用表头、空列、合并单元格和当前导出格式。图片/PDF 只负责提供文字和坐标框，行列、方向和过道仍需要规则确认。

### 5.2 学生匹配

匹配顺序固定为：

1. 学号精确匹配。
2. 姓名完全匹配。
3. 去除空格、括号、全半角差异后的匹配。
4. 模糊候选匹配，交给教师确认。

匹配结果需要保留来源和置信度：

```ts
interface StudentMatch {
  sourceText: string;
  studentId: string | null;
  status: "EXACT" | "CANDIDATE" | "UNMATCHED" | "DUPLICATE" | "OUT_OF_CLASS";
  candidates: Array<{ studentId: string; name: string; score: number }>;
}
```

性别、成绩、视力和其他学生属性只使用数据库中的明确字段，不从姓名或图片推断。

### 5.3 标准化结果

标准化后得到 `SeatingImportDraft`：

```ts
interface SeatingImportDraft {
  rows: number;
  columns: number;
  assignments: Array<{ studentId: string; row: number; column: number }>;
  environment: SeatingEnvironment;
  orientation: "FRONT_TOP" | "FRONT_BOTTOM";
  issues: ImportIssue[];
}
```

导入阶段只产生草稿。应用阶段重新读取班级、学生和当前座次，并在服务端重新校验，避免客户端修改草稿后绕过权限和约束。

## 6. 历史规律推断

### 6.1 候选规则

首期候选直接来自现有 `src/domain/seating-rotation.ts`：

- 前后排前移或后移。
- 大组向左或向右循环。
- 边列与中间列交换。
- 左右镜像、前后镜像和 180 度翻转。
- 自定义列映射。

每个候选由一个变换参数组成，不允许模型自由生成未知坐标规则。

### 6.2 推断算法

对于相邻历史快照：

1. 按 `studentId` 建立旧位置和新位置的交集。
2. 对每个候选规则计算目标位置。
3. 统计符合规则的学生数和不符合规则的学生列表。
4. 检查变换后的越界、过道、禁用座位和锁定座位冲突。
5. 跨多个快照累计匹配率，取稳定性最高的候选。

```text
匹配率 = 符合候选变换的学生数 / 可比较的学生数
```

推荐结果必须提供证据：

```json
{
  "ruleType": "GROUP_CYCLE_RIGHT",
  "parameters": {
    "rowDirection": "BACKWARD",
    "rowStep": 1,
    "groupWidth": 2
  },
  "confidence": 0.93,
  "sampleCount": 3,
  "matchedTransitions": 58,
  "comparableTransitions": 62,
  "exceptions": ["student-17", "student-24"],
  "conflicts": []
}
```

默认展示规则：

- 三张以上快照、匹配率不低于 `0.85` 且没有硬冲突：标记为“推荐”。
- 两张快照、匹配率不低于 `0.80`：标记为“参考”。
- 样本不足、冲突存在或匹配率较低：显示“未发现稳定规律”。

阈值应配置在领域模块中，并由测试固定边界行为。置信度用于排序和提示，不能替代教师确认。

### 6.3 模型边界

首期不训练班级专属深度模型。机器学习或视觉模型只处理图片/PDF 的识别和候选排序，规则推断使用可解释的候选匹配，最终坐标由领域规则校验。

当积累了足够的“推荐、修改、拒绝”记录后，再评估是否训练班级级偏好模型。跨班级训练需要单独的授权、脱敏和数据保留策略。

## 7. 数据持久化

### 7.1 `SeatingImportJob`

导入任务需要持久化，保证预览、刷新和失败重试都可恢复。

| 字段 | 说明 |
| --- | --- |
| `id` | 任务 ID |
| `classId` | 服务端鉴权上下文中的班级 ID |
| `operatorId` | 操作人 |
| `sourceType` | `XLSX`、`CSV`、`IMAGE`、`PDF` |
| `originalFileName` | 原始文件名 |
| `sourceHash` | 文件摘要，用于重复检测 |
| `status` | `PENDING`、`REVIEWING`、`APPLIED`、`REJECTED`、`EXPIRED` |
| `rawGrid` | 标准化前的网格 JSON |
| `draft` | `SeatingImportDraft` JSON |
| `issues` | 错误、警告和待确认项 JSON |
| `createdAt`、`expiresAt`、`appliedAt` | 生命周期时间 |

原始图片或 PDF 采用临时保存策略，应用完成或任务过期后按保留策略清理。已应用的结构化结果进入 `SeatingHistory`。

### 7.2 `SeatingRuleProfile`

规律方案只有在教师明确保存后才持久化：

| 字段 | 说明 |
| --- | --- |
| `id` | 方案 ID |
| `classId` | 所属班级 |
| `name` | 用户可读名称 |
| `ruleType` | 规则类型 |
| `parameters` | 行列变换参数 JSON |
| `confidence` | 最近一次推断置信度 |
| `sampleCount` | 参与推断的快照数量 |
| `source` | `MANUAL` 或 `INFERRED` |
| `active` | 是否参与后续推荐 |

如果首期只做导入和推断预览，可以延后创建 `SeatingRuleProfile`，将候选保留在导入任务中。

## 8. API 设计

```text
POST /api/seating/imports
```

创建导入任务并解析文件，返回任务 ID。请求使用 `multipart/form-data`，服务端校验 MIME、扩展名和文件大小。

```text
GET /api/seating/imports/:id
```

返回导入草稿、学生匹配、布局信息、错误列表和置信度。只能读取当前班级的任务。

```text
POST /api/seating/imports/:id/infer
```

基于当前班级历史快照生成规律候选。请求可以指定方向、过道和候选参数。

```text
POST /api/seating/imports/:id/apply
```

服务端重新加载任务和班级数据，在一个事务中写入布局、座位分配和 `SeatingHistory`。写入失败时不产生部分结果。

```text
DELETE /api/seating/imports/:id
```

取消未应用的任务并清理临时文件。已应用的任务保留审计记录。

所有接口从鉴权上下文取得 `classId`，不接受请求体中的班级 ID 作为授权依据。

## 9. 页面设计

### 9.1 识别结果页

左侧显示座位网格，右侧显示识别摘要：

- `7 × 8` 座位布局。
- 识别到的过道和方向。
- 已匹配、待确认、未匹配和重复数量。
- 当前班级学生数量与导入学生数量差异。

座位单元格使用三种状态：已匹配、待确认、空座。点击待确认单元格时显示学生候选和“留空”操作。

### 9.2 规律候选页

每个候选显示：

- 规则名称和参数。
- 匹配率、样本数和冲突数。
- 受影响学生列表。
- 应用前后的座位差异。

教师可以选择“应用一次”或“保存为班级方案”。没有候选时显示原因和手动继续入口。

### 9.3 应用确认页

确认页需要展示：

- 新增、移动、取消安排和保持不变的学生数量。
- 锁定座位和禁用座位检查结果。
- 当前座次历史记录名称。
- 应用后的撤销入口。

确认按钮使用明确文案，例如“应用导入结果并保存历史”。

## 10. 安全与数据质量

- 导入任务始终绑定当前班级和操作人。
- 只允许匹配当前班级的学生，班级外记录必须拒绝或人工处理。
- 文件先限制类型和大小，再进入解析器；解析器输出必须经过 Zod 和领域校验。
- 不向未经批准的外部服务发送学生姓名、学号和原始图片。
- 日志只记录任务 ID、状态和统计，不记录原始名单和文件内容。
- 原始文件设置过期时间，应用后保留结构化快照和文件摘要。
- 导入、推断、应用和取消动作写入审计信息。

## 11. 验收标准

### 首期导入

- 系统导出的 Excel 重新导入后，行数、列数、过道和学生位置一致。
- 普通 CSV/Excel 能识别明细格式，并对表头、空行和重复记录给出提示。
- 学号匹配、姓名匹配、候选匹配和未匹配状态可分别查看和处理。
- 重复学生、重复位置、越界位置、过道占用和班级外学生不能直接应用。
- 应用成功后生成 `SeatingHistory`，刷新页面后座次保持一致。

### 首期规律推断

- 少于两张历史快照时不生成时间规律候选。
- 每个候选都返回参数、样本数、匹配率、例外学生和冲突。
- 推荐候选应用后仍经过现有布局和环境校验。
- 锁定座位、禁用座位和历史恢复行为保持有效。

### 工程验证

- 解析器测试覆盖系统导出格式、普通明细格式、空列、合并单元格和重复记录。
- 规则测试覆盖前移、后移、镜像、大组循环、样本不足和班级成员变化。
- API 测试覆盖未登录、跨班级、重复提交、任务过期和事务失败。
- E2E 覆盖上传、修正、预览、确认应用和恢复历史。

## 12. 实施顺序

### 第一步：结构化导入

新增导入领域类型、Excel/CSV 解析、学生匹配、导入草稿和预览接口。优先支持系统自己的导出格式。

### 第二步：应用和审计

新增 `SeatingImportJob`、事务应用接口、历史记录触发类型、失败恢复和权限测试。

### 第三步：历史规律推断

复用 `seating-rotation.ts` 枚举候选规则，对 `SeatingHistory` 建立匹配评分和差异预览。

### 第四步：图片/PDF 识别

接入 OCR 或视觉识别，增加坐标框、置信度和逐格纠错。模型服务必须可替换，不能影响结构化导入。

### 第五步：自动排座

独立设计约束优化，支持前排优先、避免相邻、分组均衡等偏好，并使用导入和人工修改记录进行评估。

## 13. 代码落点

- `src/domain/seating-import.ts`：网格标准化、学生匹配和导入错误。
- `src/domain/seating-rule-inference.ts`：候选规则和评分。
- `src/components/seating/SeatingImportModal.tsx`：五步导入交互。
- `src/app/api/seating/imports/route.ts`：创建和读取任务。
- `src/app/api/seating/imports/[id]/infer/route.ts`：规律推断。
- `src/app/api/seating/imports/[id]/apply/route.ts`：事务应用。
- `prisma/schema.prisma`：导入任务和已保存规律方案。

现有 `src/domain/seating.ts`、`src/domain/seating-rotation.ts`、`src/domain/seating-history.ts` 和 `src/lib/seating-export.ts` 作为首期实现基础。

## 14. 待确认决策

以下决策不阻塞结构化导入，可以在第二期前确定：

1. 图片/PDF 识别使用本地 OCR 还是受控的视觉模型服务。
2. 原始文件保留时长和是否保存原图。
3. 是否允许管理员维护跨学期的班级规律模板。
4. 自动排座是否使用成绩、性别等字段，以及各字段的可见权限。
