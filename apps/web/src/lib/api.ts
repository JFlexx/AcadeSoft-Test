const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

let accessToken: string | null = null;
let onUnauthorized: () => void = () => {};

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setOnUnauthorized(handler: () => void): void {
  onUnauthorized = handler;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type ApiOptions = RequestInit & { skipAuth?: boolean };

async function rawRequest(path: string, options: ApiOptions): Promise<Response> {
  const { skipAuth, headers, ...rest } = options;
  const h = new Headers(headers);
  if (!h.has('Content-Type') && rest.body) h.set('Content-Type', 'application/json');
  if (!skipAuth && accessToken) h.set('Authorization', `Bearer ${accessToken}`);

  return fetch(`${API_URL}${path}`, {
    ...rest,
    headers: h,
    credentials: 'include',
  });
}

async function tryRefresh(): Promise<boolean> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { accessToken: string };
  accessToken = data.accessToken;
  return true;
}

export async function api<T = unknown>(path: string, options: ApiOptions = {}): Promise<T> {
  let res = await rawRequest(path, options);

  if (res.status === 401 && !options.skipAuth) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      res = await rawRequest(path, options);
    }
    if (res.status === 401) {
      onUnauthorized();
      throw new ApiError(401, 'Unauthorized');
    }
  }

  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { message?: string | string[] };
      if (data.message) {
        message = Array.isArray(data.message) ? data.message.join(', ') : data.message;
      }
    } catch {
      /* keep statusText */
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export async function bootstrapSession(): Promise<boolean> {
  return tryRefresh();
}
