// Worker API 공용 도구.
import { deriveKey, verifyToken, readCookie } from './session.js';

export const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});

// 편집 암호. 읽기는 누구나, 쓰기는 암호를 아는 사람만.
// 암호는 두 곳 중 하나에서 온다.
//   1) Worker 비밀값 WRITE_TOKEN(대시보드에서 넣은 것). 있으면 이것이 우선이다.
//   2) 사이트에서 처음 한 번 정한 암호(D1 settings 표에 소금 + SHA-256 해시로 저장, 원문은 저장하지 않음).
// 둘 다 없으면 쓰기를 모두 막는다(사이트가 "편집 암호 정하기"를 보여 준다).
const PASSWORD_KEY = 'write_hash';
export const MIN_PASSWORD = 6;   // 화면은 /api/health의 passwordMinLength로 이 값을 받아 쓴다
export const MAX_PASSWORD = 200;

const bearer = request => (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, salt) {
  salt ||= [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  return salt + ':' + await sha256hex(salt + password);
}

export async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash || !password) return false;
  return safeEqual(await sha256hex(salt + password), hash);
}

async function storedHash(env) {
  if (!env.DB) return null;
  try {
    const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(PASSWORD_KEY).first();
    return row ? row.value : null;
  } catch { return null; } // settings 표가 아직 없으면(예전 스키마) 암호 없음으로 본다
}

// 편집 암호가 정해져 있는가. source: 'secret'(대시보드) | 'site'(사이트에서 정함) | null
export async function passwordState(env) {
  if (env.WRITE_TOKEN) return { set: true, source: 'secret' };
  return (await storedHash(env)) ? { set: true, source: 'site' } : { set: false, source: null };
}

// 암호 원문이 맞는가(대시보드 비밀값 우선, 없으면 사이트에서 정한 해시).
export async function checkPassword(env, password) {
  if (!password) return false;
  if (env.WRITE_TOKEN) return safeEqual(password, env.WRITE_TOKEN);
  return verifyPassword(password, await storedHash(env));
}

// 쓰기 허락: ① Authorization: Bearer <편집 암호>(예전 방식·스크립트용) ② 허브 로그인 표시(쿠키 hub_session).
export async function canWrite(request, env) {
  if (await checkPassword(env, bearer(request))) return true;
  const token = readCookie(request);
  return token ? (await checkSession(env, token)).ok : false;
}

// ── 허브 로그인 표시(src/lib/session.js) ──────────────────────
const SESSION_SECRET_KEY = 'session_secret';

// 지금 편집 암호를 나타내는 글자(원문 아님). 암호가 바뀌면 달라져서 예전 로그인 표시가 모두 무효가 된다.
async function passwordFingerprint(env) {
  if (env.WRITE_TOKEN) return 'secret:' + await sha256hex(env.WRITE_TOKEN);
  const h = await storedHash(env);
  return h ? 'site:' + h : null;
}

// 서명 열쇠. 편집 암호가 아직 없으면 null(로그인할 수 없다).
export async function sessionKey(env) {
  const fp = await passwordFingerprint(env);
  if (!fp || !env.DB) return null;
  const fresh = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)').bind(SESSION_SECRET_KEY, fresh).run();
  const row = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(SESSION_SECRET_KEY).first();
  return row ? deriveKey(row.value, fp) : null;
}

export async function checkSession(env, token) {
  const key = await sessionKey(env).catch(() => null);
  return key ? verifyToken(key, token) : { ok: false };
}

// 모든 기기에서 로그아웃: 무작위 값을 지우면 다음에 새로 만들어져 예전 표시가 모두 무효가 된다.
export async function rotateSessionSecret(env) {
  await env.DB.prepare('DELETE FROM settings WHERE key = ?').bind(SESSION_SECRET_KEY).run();
}

// 처음 한 번만 성공한다. 이미 정해졌으면 false.
export async function claimPassword(env, password) {
  if (env.WRITE_TOKEN) return false;
  const r = await env.DB.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
    .bind(PASSWORD_KEY, await hashPassword(password)).run();
  return r.meta.changes === 1;
}

export const nowIso = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z');

export async function logUsage(env, event) {
  await env.DB.prepare('INSERT INTO usage_log (ts, event) VALUES (?, ?)').bind(nowIso(), event).run();
}
