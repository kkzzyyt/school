export interface ApiFailure {
  success: false;
  error: { code: string; message: string };
  requestId?: string;
}

export class ApiClientError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ApiClientError";
  }
}

export interface ApiRequestOptions extends RequestInit {
  redirectOnUnauthorized?: boolean;
}

export async function apiRequest<T>(url: string, options?: ApiRequestOptions): Promise<T> {
  const { redirectOnUnauthorized = true, ...requestOptions } = options ?? {};
  const response = await fetch(url, {
    ...requestOptions,
    headers: {
      ...(requestOptions.body ? { "Content-Type": "application/json" } : {}),
      ...requestOptions.headers,
    },
  });
  const payload = (await response.json()) as { success: true; data: T } | ApiFailure;

  if (!response.ok || !payload.success) {
    const failure = payload as ApiFailure;
    if (response.status === 401 && redirectOnUnauthorized && typeof window !== "undefined") {
      window.location.replace("/login");
    }
    throw new ApiClientError(
      failure.error?.code ?? "REQUEST_FAILED",
      failure.error?.message ?? "请求失败，请稍后重试",
    );
  }
  return payload.data;
}
