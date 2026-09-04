import { hash } from "argon2";

import { UserRole, UserStatus } from "@/generated/prisma/enums";
import { handleApi, ApiError } from "@/server/api/errors";
import { assertSameOrigin } from "@/server/auth/origin";
import { prisma } from "@/server/db/prisma";
import { registrationSchema } from "@/server/validation/user";

export async function POST(request: Request) {
  return handleApi(async () => {
    assertSameOrigin(request);
    const input = registrationSchema.parse(await request.json().catch(() => null));
    const existingUser = await prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });

    if (existingUser) {
      throw new ApiError(409, "CONFLICT", "该账号已存在");
    }

    const passwordHash = await hash(input.password, { type: 2 });
    await prisma.user.create({
      data: {
        username: input.username,
        displayName: input.displayName,
        passwordHash,
        role: UserRole.HEAD_TEACHER,
        status: UserStatus.PENDING,
      },
    });

    return { status: UserStatus.PENDING };
  });
}
