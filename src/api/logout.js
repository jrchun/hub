// POST /api/logout {all?} → 200 + 로그인 쿠키 지우기
// all: true면 모든 기기·브라우저의 로그인 표시를 무효로 만든다(로그인한 상태에서만).
import { json, canWrite, rotateSessionSecret } from '../lib/http.js';
import { sessionCookie } from '../lib/session.js';

export async function POST({ request, env }) {
  const body = await request.json().catch(() => ({}));
  let all = false;
  if (body?.all === true && (await canWrite(request, env))) { await rotateSessionSecret(env); all = true; }
  const res = json({ ok: true, all });
  res.headers.set('Set-Cookie', sessionCookie('', { host: new URL(request.url).host, domain: env.SESSION_DOMAIN, maxAge: 0 }));
  return res;
}
