// 서버 통신. 같은 출처의 /api 만 호출한다.
// 읽기는 누구나, 숨기기·삭제·지금 확인은 편집 암호가 있어야 한다. 암호는 이 기기 브라우저에만 저장한다.

const TOKEN_KEY = 'app-write-token';
export function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; } }
export function setToken(t) { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* 저장 공간이 없으면 이번 화면에서만 쓴다 */ } }
let memoryToken = '';
const token = () => getToken() || memoryToken;
export function rememberToken(t) { memoryToken = t; setToken(t); }
const auth = () => { const t = token(); return t ? { Authorization: 'Bearer ' + t } : {}; };

async function call(method, path, body) {
  const res = await fetch(path, {
    method, cache: 'no-store',
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...auth() },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, data: j }; // data: 서버가 보낸 JSON(이름이 겹치지 않게 따로 둔다)
}

// {apps, canEdit}
export async function getApps() {
  const r = await call('GET', '/api/apps');
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.data;
}
export const setHidden = (url, hidden) => call('PUT', '/api/apps', { url, hidden });
export const removeApp = url => call('DELETE', '/api/apps?url=' + encodeURIComponent(url));
export const refreshAll = () => call('POST', '/api/refresh');

// 서버 상태. passwordSet이 false면 아직 편집 암호가 없다(화면에서 처음 정한다).
export async function getStatus() {
  const res = await fetch('/api/health', { cache: 'no-store' });
  return res.json();
}

// 편집 암호 처음 정하기. 성공 { ok: true } / 이미 정해짐 { ok: false, taken: true } / 너무 짧음 { ok: false, detail }
export async function claimPassword(password) {
  const res = await fetch('/api/password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  if (res.status === 201) return { ok: true };
  if (res.status === 409) return { ok: false, taken: true };
  const j = await res.json().catch(() => ({}));
  return { ok: false, detail: j.detail || 'HTTP ' + res.status };
}
