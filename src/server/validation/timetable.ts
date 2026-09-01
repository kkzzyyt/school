import { z } from "zod";

const timeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间必须使用 HH:mm 格式");

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable();

export const timetablePeriodTypeSchema = z.enum([
  "CLASS",
  "MORNING_STUDY",
  "LUNCH_BREAK",
  "EVENING_STUDY",
]);

export const timetablePeriodInputSchema = z
  .object({
    period: z.number().int().min(1).max(1000).optional(),
    name: z.string().trim().min(1, "请输入时段名称").max(50),
    type: timetablePeriodTypeSchema,
    startTime: timeSchema,
    endTime: timeSchema,
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine((value) => value.startTime < value.endTime, {
    path: ["endTime"],
    message: "结束时间必须晚于开始时间",
  });

export const timetablePeriodPatchSchema = z
  .object({
    name: z.string().trim().min(1, "请输入时段名称").max(50).optional(),
    type: timetablePeriodTypeSchema.optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    sortOrder: z.number().int().min(0).max(1_000_000).optional(),
  })
  .superRefine((value, context) => {
    if (
      value.startTime !== undefined &&
      value.endTime !== undefined &&
      value.startTime >= value.endTime
    ) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "结束时间必须晚于开始时间",
      });
    }
  });

export const timetablePeriodReorderSchema = z.object({
  periods: z
    .array(
      z.object({
        id: z.string().min(1),
        sortOrder: z.number().int().min(0).max(1_000_000),
      }),
    )
    .max(100),
});

export const timetableEntrySchema = z
  .object({
    id: z.string().min(1).optional(),
    courseId: z.string().min(1),
    weekday: z.number().int().min(1).max(7),
    period: z.number().int().min(1).max(1000).optional(),
    periodId: z.string().min(1).optional().nullable(),
    teacherId: z.string().min(1).optional().nullable(),
    teacherName: optionalText(50),
    room: optionalText(50),
  })
  .superRefine((value, context) => {
    if (!value.periodId && value.period === undefined) {
      context.addIssue({
        code: "custom",
        path: ["period"],
        message: "请提供课程节次或时段 ID",
      });
    }
  });

export const timetableSaveSchema = z.object({
  entries: z.array(timetableEntrySchema).max(1000),
  periods: timetablePeriodReorderSchema.shape.periods.optional(),
});

