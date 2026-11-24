// 허브 로그인 표시(세션). 허브에서 한 번 로그인하면 woongstudio.com 아래 모든 앱에서 편집할 수 있게 한다.
//
// 표시 = "v1.<만료 시각(초)>.<서명>". 서명 = HMAC-SHA256(열쇠, "v1.<만료>")를 base64url로.
// 열쇠 = SHA-256(허브만 아는 무작위 값 | 지금 편집 암호의 지문). 그래서
//   - 편집 암호가 바뀌면(초기화 포함) 예전 표시는 모두 무효가 된다.
//   - "모든 기기에서 로그아웃"은 무작위 값을 새로 만들면 된다.
// 브라우저에는 쿠키 hub_session으로 저장한다(HttpOnly: 화면 스크립트가 읽지 못함). 앱들은 그 값을 /api/session으로 허브에 물어 확인한다.
// 이 파일의 함수는 D1·요청에 닿지 않는 순수 함수다(tests/session.test.js).

export const COOKIE_NAME = 'hub_session';
export const SESSION_DAYS = 90;
const enc = new TextEncoder();

const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(keyBytes, text) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

// 서명 열쇠. secret: 허브만 아는 무작위 값, fingerprint: 지금 편집 암호를 나타내는 글자(해시 등, 원문 아님).
export async function deriveKey(secret, fingerprint) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(`${secret}|${fingerprint}`)));
}

export async function makeToken(key, nowSec = Math.floor(Date.now() / 1000), days = SESSION_DAYS) {
  const exp = nowSec + days * 86400;
  const body = `v1.${exp}`;
  return { token: `${body}.${await hmac(key, body)}`, exp };
}

function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// → { ok: true, exp } | { ok: false }
export async function verifyToken(key, token, nowSec = Math.floor(Date.now() / 1000)) {
  const m = /^v1\.(\d{1,12})\.([A-Za-z0-9_-]{20,100})$/.exec(String(token || ''));
  if (!m || !key) return { ok: false };
  const exp = Number(m[1]);
  if (exp <= nowSec) return { ok: false };
  return sameText(await hmac(key, `v1.${m[1]}`), m[2]) ? { ok: true, exp } : { ok: false };
}

// 요청의 Cookie 헤더에서 값 하나를 꺼낸다.
export function readCookie(request, name = COOKIE_NAME) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
}

// 로그인 쿠키. domain(예: woongstudio.com)이 있고 요청 주소가 그 아래일 때만 Domain을 붙여 모든 앱이 받게 한다.
// 그 밖(예: hub.tedcheon.workers.dev, localhost)은 그 주소에서만 쓰는 쿠키가 된다.
export function sessionCookie(token, { host, domain, maxAge = SESSION_DAYS * 86400 } = {}) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  const d = String(domain || '').toLowerCase();
  const scoped = d && (h === d || h.endsWith('.' + d)) ? `; Domain=${d}` : '';
  return `${COOKIE_NAME}=${token}; Path=/${scoped}; Max-Age=${maxAge}; Secure; HttpOnly; SameSite=Lax`;
}

// 로그인 뒤 돌아갈 주소가 안전한가(남의 사이트로 보내는 데 쓰이지 않게).
// 받는 것: 허브와 같은 주인의 https 주소(isAllowedHost), 또는 허브가 localhost일 때의 localhost(내 컴퓨터 시험).
export function safeReturn(input, hubHost, isAllowedHost) {
  let u;
  try { u = new URL(String(input || '')); } catch { return null; }
  if (u.username || u.password) return null;
  const hubLocal = /^localhost(:\d+)?$/.test(String(hubHost || ''));
  if (u.protocol === 'http:' && hubLocal && u.hostname === 'localhost') return u.href;
  if (u.protocol !== 'https:') return null;
  return isAllowedHost(u.hostname.toLowerCase()) ? u.href : null;
}
