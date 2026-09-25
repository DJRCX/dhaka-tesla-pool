export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: { requestId?: string; details?: unknown },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.requestId = options?.requestId;
    this.details = options?.details;
  }
}

type ErrorBody = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    details?: unknown;
  };
};

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers,
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  let data: unknown = undefined;
  if (text.length > 0) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const body = (typeof data === 'object' && data !== null ? data : {}) as ErrorBody;
    throw new ApiError(
      response.status,
      body.error?.code ?? 'INTERNAL',
      body.error?.message ?? (response.statusText || 'Request failed'),
      {
        requestId: body.error?.requestId,
        details: body.error?.details,
      },
    );
  }

  return data as T;
}
