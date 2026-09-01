import { z } from "zod";

export const dutyInputSchema = z.object({
  name: z.string().trim().min(1, "请输入小组名称").max(50),
  weekday: z.number().int().min(1).max(7),
  area: z.string().trim().min(1, "请输入值日区域").max(100),
  notes: z.string().trim().max(255).optional().nullable(),
  sortOrder: z.number().int().min(0).default(0),
  studentIds: z.array(z.string()).max(20).default([]),
});
