import { getStore } from '@netlify/blobs';
import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const STORE_NAME = 'owenow-store';
const STATE_BLOB_KEY = 'state/db-v1';
const LOCAL_STORE_FILE = path.join(process.cwd(), '.data', 'cloud-store.json');
const LOCAL_RECEIPTS_FILE = path.join(process.cwd(), '.data', 'receipts.json');
export const SESSION_COOKIE = 'owenow_session';

export function json(status, body, extraHeaders = {}) {
  return {
    statusCode: status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

export function redirect(location, extraHeaders = {}) {
  return {
    statusCode: 302,
    headers: {
      Location: location,
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
    body: '',
  };
}

export function resolveOrigin(event) {
  const headers = event?.headers || {};
  const host = headers['x-forwarded-host'] || headers.host || headers.Host;
  if (host) {
    const proto =
      headers['x-forwarded-proto'] ||
      (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  if (event?.rawUrl) {
    try {
      return new URL(event.rawUrl).origin;
    } catch {
      // ignore
    }
  }
  return (
    process.env.URL ||
    process.env.DEPLOY_PRIME_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.VITE_APP_URL ||
    'http://localhost:5173'
  ).replace(/\/+$/, '');
}

/**
 * Custom fetch wrapper for Netlify Blobs (same as Meridian) so missing keys on S3 signed URLs
 * (which can return 403) or slow network calls do not trigger @netlify/blobs's 5 × 5s retry loop.
 */
export const fastBlobsFetch = async (input, init) => {
  try {
    const res = await fetch(input, {
      ...init,
      signal: init?.signal ?? AbortSignal.timeout(5000),
    });
    const urlStr =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? 'GET').toUpperCase();

    if (!urlStr.includes('api.netlify.com') && res.status === 403 && method === 'GET') {
      return new Response(null, { status: 404, headers: res.headers });
    }
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      return new Response(res.body, { status: 400, headers: res.headers });
    }
    return res;
  } catch {
    return new Response(null, { status: 400 });
  }
};

export function resolveNetlifyStore() {
  try {
    const hasAutoContext =
      Boolean(process.env.NETLIFY_BLOBS_CONTEXT) ||
      Boolean(globalThis.netlifyBlobsContext);

    if (hasAutoContext) {
      return getStore({ name: STORE_NAME, consistency: 'strong', fetch: fastBlobsFetch });
    }

    const siteID = process.env.NETLIFY_SITE_ID;
    const token = process.env.NETLIFY_AUTH_TOKEN;
    if (siteID && token) {
      return getStore({
        name: STORE_NAME,
        siteID,
        token,
        consistency: 'strong',
        fetch: fastBlobsFetch,
      });
    }
  } catch {
    // Fall back to local file store in non-Netlify dev environments
  }
  return null;
}

function defaultState() {
  return {
    profiles: {},
    groups: {},
    group_members: [],
    expenses: {},
    settlements: {},
    notifications: [],
    pending_invites: [],
    updatedAt: 0,
  };
}

function normalizeState(raw) {
  const base = defaultState();
  if (!raw || typeof raw !== 'object') return base;
  return {
    profiles: raw.profiles && typeof raw.profiles === 'object' ? raw.profiles : {},
    groups: raw.groups && typeof raw.groups === 'object' ? raw.groups : {},
    group_members: Array.isArray(raw.group_members) ? raw.group_members : [],
    expenses: raw.expenses && typeof raw.expenses === 'object' ? raw.expenses : {},
    settlements: raw.settlements && typeof raw.settlements === 'object' ? raw.settlements : {},
    notifications: Array.isArray(raw.notifications) ? raw.notifications : [],
    pending_invites: Array.isArray(raw.pending_invites) ? raw.pending_invites : [],
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : 0,
  };
}

let memoryCache = null;
const MEMORY_CACHE_TTL_MS = 5_000;

async function readLocalStore() {
  try {
    const raw = await fs.readFile(LOCAL_STORE_FILE, 'utf8');
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocalStore(state) {
  try {
    await fs.mkdir(path.dirname(LOCAL_STORE_FILE), { recursive: true });
    await fs.writeFile(LOCAL_STORE_FILE, JSON.stringify(state, null, 2), 'utf8');
  } catch {
    // Ignore on read-only serverless filesystems
  }
}

export async function readStore(forceRefresh = false) {
  if (!forceRefresh && memoryCache && Date.now() - memoryCache.fetchedAt < MEMORY_CACHE_TTL_MS) {
    return memoryCache.state;
  }

  const localState = await readLocalStore();
  const store = resolveNetlifyStore();

  if (store) {
    try {
      const cloudRaw = await store.get(STATE_BLOB_KEY, { type: 'json' });
      if (cloudRaw) {
        const cloudState = normalizeState(cloudRaw);
        const chosen =
          localState && localState.updatedAt > cloudState.updatedAt ? localState : cloudState;
        memoryCache = { state: chosen, fetchedAt: Date.now() };
        return chosen;
      }
    } catch {
      // Fall back to local store if Netlify Blobs is unreachable
    }
  }

  const resolved = localState ?? defaultState();
  memoryCache = { state: resolved, fetchedAt: Date.now() };
  return resolved;
}

export async function writeStore(state) {
  state.updatedAt = Date.now();
  memoryCache = { state, fetchedAt: Date.now() };

  await writeLocalStore(state);

  const store = resolveNetlifyStore();
  if (store) {
    try {
      await store.setJSON(STATE_BLOB_KEY, state);
    } catch {
      // Local fallback already persisted
    }
  }
  return state;
}

// ----------------------------------------------------------------------------
// Receipt storage (Netlify Blobs + local .data/receipts.json fallback)
// ----------------------------------------------------------------------------

async function readLocalReceipts() {
  try {
    const raw = await fs.readFile(LOCAL_RECEIPTS_FILE, 'utf8');
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

async function writeLocalReceipts(all) {
  try {
    await fs.mkdir(path.dirname(LOCAL_RECEIPTS_FILE), { recursive: true });
    await fs.writeFile(LOCAL_RECEIPTS_FILE, JSON.stringify(all, null, 2), 'utf8');
  } catch {
    // Ignore on read-only serverless filesystems
  }
}

export async function saveReceipt(pathKey, dataUrl) {
  const blobKey = `receipts/${pathKey}`;
  const all = await readLocalReceipts();
  all[blobKey] = dataUrl;
  await writeLocalReceipts(all);

  const store = resolveNetlifyStore();
  if (store) {
    try {
      await store.setJSON(blobKey, { dataUrl, updatedAt: Date.now() });
    } catch {
      // Ignore
    }
  }
  return pathKey;
}

export async function getReceipt(pathKey) {
  if (!pathKey) return null;
  if (pathKey.startsWith('data:')) return pathKey;
  const blobKey = `receipts/${pathKey}`;

  const store = resolveNetlifyStore();
  if (store) {
    try {
      const found = await store.get(blobKey, { type: 'json' });
      if (found?.dataUrl) return found.dataUrl;
    } catch {
      // Fall back to local
    }
  }

  const all = await readLocalReceipts();
  return all[blobKey] ?? null;
}

// ----------------------------------------------------------------------------
// Deterministic User IDs + JWT Session Auth (same pattern as Meridian)
// ----------------------------------------------------------------------------

export function userIdFromEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  const hex = crypto.createHash('sha256').update(`owenow:${clean}`).digest('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `5${hex.slice(13, 16)}`,
    `8${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-');
}

function getSecret() {
  return (
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    'owenow-dev-secret-change-in-prod'
  );
}

export function signJwt(payload, expiresInSec = 60 * 60 * 24 * 30) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: now,
      exp: now + expiresInSec,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  const expected = crypto
    .createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64url');
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader = '') {
  const out = {};
  if (!cookieHeader) return out;
  for (const pair of cookieHeader.split(';')) {
    const idx = pair.indexOf('=');
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  }
  return out;
}

export function makeSessionCookie(token, maxAgeSec = 60 * 60 * 24 * 30) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function extractToken(event) {
  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (auth?.startsWith('Bearer ')) {
    const t = auth.slice('Bearer '.length).trim();
    if (t && t !== 'null' && t !== 'undefined') return t;
  }
  const cookieHeader = event.headers?.cookie || event.headers?.Cookie || '';
  const cookies = parseCookies(cookieHeader);
  if (cookies[SESSION_COOKIE]) return cookies[SESSION_COOKIE];
  return null;
}

export async function upsertUserOnSignIn({ email, name, image }) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!cleanEmail) throw new Error('Email is required');

  const id = userIdFromEmail(cleanEmail);
  const state = await readStore();
  const nowIso = new Date().toISOString();
  const existing = state.profiles[id];

  const profile = {
    id,
    email: cleanEmail,
    full_name: existing?.full_name || name || cleanEmail.split('@')[0],
    avatar_url: image ?? existing?.avatar_url ?? null,
    created_at: existing?.created_at || nowIso,
  };
  state.profiles[id] = profile;

  // Auto-join any non-expired pending invites addressed to this email
  const nowMs = Date.now();
  const matchingInvites = state.pending_invites.filter(
    (pi) =>
      pi.email?.toLowerCase() === cleanEmail &&
      (!pi.expires_at || new Date(pi.expires_at).getTime() > nowMs)
  );

  for (const inv of matchingInvites) {
    const alreadyMember = state.group_members.some(
      (gm) => gm.group_id === inv.group_id && gm.user_id === id
    );
    if (!alreadyMember && state.groups[inv.group_id]) {
      state.group_members.push({
        id: crypto.randomUUID(),
        group_id: inv.group_id,
        user_id: id,
        role: 'member',
        joined_at: nowIso,
      });
      state.notifications.unshift({
        id: crypto.randomUUID(),
        user_id: id,
        type: 'group_invite',
        message: `You were added to "${state.groups[inv.group_id]?.name || 'a group'}"`,
        is_read: false,
        related_group_id: inv.group_id,
        created_at: nowIso,
      });
    }
  }

  if (matchingInvites.length > 0) {
    state.pending_invites = state.pending_invites.filter(
      (pi) => pi.email?.toLowerCase() !== cleanEmail
    );
  }

  await writeStore(state);
  return profile;
}

export async function authUser(event) {
  const token = extractToken(event);
  if (!token) {
    const err = new Error('Not signed in');
    err.status = 401;
    throw err;
  }

  const payload = verifyJwt(token);
  if (!payload?.email || !payload?.sub) {
    const err = new Error('Session expired or invalid. Please sign in again.');
    err.status = 401;
    throw err;
  }

  const state = await readStore();
  let profile = state.profiles[payload.sub];
  if (!profile) {
    profile = {
      id: payload.sub,
      email: payload.email.toLowerCase(),
      full_name: payload.name || payload.email.split('@')[0],
      avatar_url: payload.picture || null,
      created_at: new Date().toISOString(),
    };
    state.profiles[payload.sub] = profile;
    await writeStore(state);
  }

  const user = {
    id: profile.id,
    email: profile.email,
    user_metadata: {
      full_name: profile.full_name,
      avatar_url: profile.avatar_url,
    },
  };

  return { user, profile, state, token };
}

export function isGroupMember(state, groupId, userId) {
  return state.group_members.some((m) => m.group_id === groupId && m.user_id === userId);
}
