// 허브 로그인 표시 확인.
//   POST /api/session {token} → 200 {ok, exp} | 401 {ok: false}  : 다른 앱의 서버가 부른다(쿠키 값을 넘겨 진짜인지 묻는다)
//   GET  /api/session          → {loggedIn, exp?}               : 허브 화면이 내 로그인 상태를 볼 때(쿠키로)
import { json, checkSession } from '../lib/http.js';
import { readCookie } from '../lib/session.js';

export async function POST({ request, env }) {
  const body = await request.json().catch(() => ({}));
  const r = await checkSession(env, typeof body?.token === 'string' ? body.token : '');
  return r.ok ? json({ ok: true, exp: r.exp }) : json({ ok: false }, 401);
}

export async function GET({ request, env }) {
  const token = readCookie(request);
  const r = token ? await checkSession(env, token) : { ok: false };
  return json({ loggedIn: r.ok, exp: r.ok ? r.exp : undefined });
}
