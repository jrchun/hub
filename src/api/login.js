// POST /api/login {password, return?} → 200 {ok, exp, next?} + 로그인 쿠키 | 401 틀림 | 409 암호 없음 | 429 너무 많이 틀림
// 허브에서 한 번 로그인하면 woongstudio.com 아래 모든 앱에서 편집할 수 있다(쿠키 hub_session, src/lib/session.js).
// 같은 접속 위치(IP)에서 10분 동안 10번 틀리면 잠시 막는다. return: 로그인 뒤 돌아갈 앱 주소(같은 주인일 때만 next로 돌려준다).
import { json, checkPassword, passwordState, sessionKey } from '../lib/http.js';
import { makeToken, sessionCookie, safeReturn } from '../lib/session.js';
import { allowedOwners, allowedHosts, ownerOf } from '../lib/hub.js';

export const MAX_FAILS = 10;
export const FAIL_WINDOW_MS = 10 * 60_000;

export async function POST({ request, env }, now = Date.now()) {
  let body;
  try { body = await request.json(); } catch { return json({ detail: 'JSON이 아닙니다.' }, 400); }
  const ip = request.headers.get('CF-Connecting-IP') || 'local';
  const row = await env.DB.prepare('SELECT count, since FROM login_attempts WHERE ip = ?').bind(ip).first();
  const recent = row && row.since > now - FAIL_WINDOW_MS;
  if (recent && row.count >= MAX_FAILS) return json({ detail: '여러 번 틀려서 잠시 막았습니다. 10분 뒤 다시 해 주세요.' }, 429);

  if (!(await passwordState(env)).set) return json({ detail: '허브 편집 암호가 아직 없습니다. 허브에서 "편집"을 눌러 먼저 정해 주세요.' }, 409);
  const password = typeof body?.password === 'string' ? body.password.trim() : '';
  if (!(await checkPassword(env, password))) {
    await env.DB.prepare(
      `INSERT INTO login_attempts (ip, count, since) VALUES (?, 1, ?)
       ON CONFLICT(ip) DO UPDATE SET count = CASE WHEN since > ? THEN count + 1 ELSE 1 END,
                                     since = CASE WHEN since > ? THEN since ELSE excluded.since END`
    ).bind(ip, now, now - FAIL_WINDOW_MS, now - FAIL_WINDOW_MS).run();
    return json({ detail: '편집 암호가 맞지 않습니다.' }, 401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE ip = ?').bind(ip).run();

  const host = new URL(request.url).host;
  const { token, exp } = await makeToken(await sessionKey(env), Math.floor(now / 1000));
  const owners = allowedOwners(host, env.OWNER_DOMAINS), hosts = allowedHosts(env.OWNER_HOSTS);
  const next = body?.return ? safeReturn(body.return, host, h => owners.has(ownerOf(h)) || hosts.has(h)) : null;
  return new Response(JSON.stringify({ ok: true, exp, next: next || undefined }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(token, { host, domain: env.SESSION_DOMAIN }),
    },
  });
}
