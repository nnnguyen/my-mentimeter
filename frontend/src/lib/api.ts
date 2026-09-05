export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
export const API_URL = `${API_BASE_URL}/api`;

export async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const fullPath = path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`;
  const response = await fetch(`${API_BASE_URL}${fullPath}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  const isJson = response.headers.get('Content-Type')?.includes('application/json');
  const data = isJson ? await response.json() : null;

  if (!response.ok) {
    const errorMessage = data?.message || (Array.isArray(data?.message) ? data.message[0] : null) || 'Đã có lỗi xảy ra';
    throw new Error(Array.isArray(errorMessage) ? errorMessage[0] : errorMessage);
  }

  return data || response;
}
