const rawBase = import.meta.env.VITE_API_URL || '/api';
export const API_BASE = rawBase.replace(/\/$/, '');
const TOKEN_KEY = 'lpareports_token';
const LEGACY_TOKEN_KEY = 'lpacamis_token';

// Drop sessions created by the old Lpacamis build so they log out cleanly.
try {
  if (localStorage.getItem(LEGACY_TOKEN_KEY)) localStorage.removeItem(LEGACY_TOKEN_KEY);
} catch {
  // localStorage may be unavailable (e.g. privacy mode); the new key is simply used.
}

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export class ApiError extends Error {
  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function parseBody(response) {
  const type = response.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return response.json().catch(() => ({}));
  }
  return response.text();
}

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  const data = await parseBody(response);
  if (!response.ok) {
    const message =
      (data && typeof data === 'object' && data.message) ||
      (typeof data === 'string' && data) ||
      `Request failed (${response.status}).`;
    throw new ApiError(message, response.status, data?.errors);
  }
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body) => request(path, { method: 'POST', body }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  delete: (path) => request(path, { method: 'DELETE' })
};

function filenameFromHeaders(response, fallback) {
  const disposition = response.headers.get('content-disposition') || '';
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) return decodeURIComponent(utf8Match[1]);
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match ? match[1] : fallback;
}

export async function download(path, fallbackName = 'download', { method = 'GET', body } = {}) {
  const token = getToken();
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    const data = await parseBody(response);
    throw new ApiError(data?.message || 'Download failed.', response.status, data?.errors);
  }

  const blob = await response.blob();
  const filename = filenameFromHeaders(response, fallbackName);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return filename;
}
