import { ApiError } from "@/server/api/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function firstForwardedValue(value: string | null): string | null {
  return value?.split(",")[0]?.trim() || null;
}

export function assertSameOrigin(
  request: Request,
  environment = process.env.NODE_ENV,
): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin");
  if (!origin) {
    if (environment === "production") {
      throw new ApiError(403, "FORBIDDEN", "请求来源不受信任");
    }
    return;
  }

  const forwardedHost = firstForwardedValue(request.headers.get("x-forwarded-host"));
  const forwardedProtocol = firstForwardedValue(
    request.headers.get("x-forwarded-proto"),
  );
  const host = forwardedHost ?? request.headers.get("host");
  const protocol = forwardedProtocol ?? new URL(request.url).protocol.replace(":", "");

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    throw new ApiError(403, "FORBIDDEN", "请求来源不受信任");
  }

  if (!host || normalizedOrigin !== `${protocol}://${host}`) {
    throw new ApiError(403, "FORBIDDEN", "请求来源不受信任");
  }
}
