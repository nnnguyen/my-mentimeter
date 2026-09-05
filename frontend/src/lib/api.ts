export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
export const API_URL = `${API_BASE_URL}/api`;

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const fullPath = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
  return fetch(`${API_BASE_URL}${fullPath}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}
