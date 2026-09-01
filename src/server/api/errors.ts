import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "STALE_WRITE"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ApiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isPrismaKnownError(error: unknown): error is { code: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  );
}

export async function handleApi<T>(
  operation: () => Promise<T>,
): Promise<NextResponse> {
  const requestId = crypto.randomUUID();

  try {
    const data = await operation();
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: error.issues[0]?.message ?? "请求参数不正确",
          },
          requestId,
        },
        { status: 400 },
      );
    }

    if (error instanceof ApiError) {
      return NextResponse.json(
        {
          success: false,
          error: { code: error.code, message: error.message },
          requestId,
        },
        { status: error.status },
      );
    }

    if (isPrismaKnownError(error) && error.code === "P2002") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "CONFLICT", message: "数据已存在，请检查后重试" },
          requestId,
        },
        { status: 409 },
      );
    }

    console.error(`[${requestId}] Unexpected API error`, error);
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: "服务暂时不可用" },
        requestId,
      },
      { status: 500 },
    );
  }
}

export function notFound(message = "数据不存在"): never {
  throw new ApiError(404, "NOT_FOUND", message);
}
