const TOKEN_KEY = 'payslip_studio_jwt';
const USER_KEY = 'payslip_studio_user';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser<T = any>(): T | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function setStoredSession(token: string, user: unknown): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function apiRequest<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
  });

  if (
    response.status === 401 &&
    !path.includes('/api/auth/login') &&
    !path.includes('/api/auth/admin-login')
  ) {
    clearStoredSession();
    window.dispatchEvent(new CustomEvent('payslip-auth-expired'));
    throw new Error('Session expired. Please sign in again.');
  }

  if (!response.ok) {
    let errMessage = `Request failed (${response.status})`;
    try {
      const errJson = await response.json();
      if (errJson?.message) errMessage = errJson.message;
    } catch {
      // fallback
    }
    throw new Error(errMessage);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export function getAuthorizedDownloadUrl(path: string): string {
  const token = getStoredToken();
  if (!token) return path;
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}access_token=${encodeURIComponent(token)}`;
}

