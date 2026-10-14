const TOKEN_KEY = 'owenow-auth-token';
const USER_CACHE_KEY = 'owenow-session-cache';
const SYNC_CHANNEL = 'owenow-sync';

export function getStoredToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token) {
  if (typeof window === 'undefined') return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getCachedSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedSession(data) {
  if (typeof window === 'undefined') return;
  try {
    if (data) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(data));
    else localStorage.removeItem(USER_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}

export async function apiFetch(path, { method = 'GET', body, headers = {} } = {}) {
  const token = getStoredToken();
  const reqHeaders = { ...headers };
  if (token) {
    reqHeaders.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined && !reqHeaders['Content-Type']) {
    reqHeaders['Content-Type'] = 'application/json';
  }

  const res = await fetch(path, {
    method,
    headers: reqHeaders,
    credentials: 'include',
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

let channel = null;
function getSyncChannel() {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  if (!channel) {
    try {
      channel = new BroadcastChannel(SYNC_CHANNEL);
    } catch {
      return null;
    }
  }
  return channel;
}

export function broadcastChange(payload = {}) {
  const ch = getSyncChannel();
  if (ch) {
    try {
      ch.postMessage({ at: Date.now(), ...payload });
    } catch {
      // ignore
    }
  }
}

export function subscribeChanges(listener) {
  const ch = getSyncChannel();
  if (!ch) return () => {};
  const handler = (event) => listener(event.data || {});
  ch.addEventListener('message', handler);
  return () => ch.removeEventListener('message', handler);
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
