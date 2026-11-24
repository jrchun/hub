// 허브 로그인(src/lib/session.js, src/api/login·logout·session.js). D1은 메모리 SQLite. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { deriveKey, makeToken, verifyToken, readCookie, sessionCookie, safeReturn } from '../src/lib/session.js';
import { hashPassword } from '../src/lib/http.js';
import * as login from '../src/api/login.js';
import { makeD1 } from './d1_sqlite.js';

const HUB = 'hub.woongstudio.com';
const VARS = { OWNER_DOMAINS: 'woongstudio.com,tedcheon.workers.dev', OWNER_HOSTS: 'haenya.pages.dev', SESSION_DOMAIN: 'woongstudio.com' };
async function env0({ password = 'hub-pass-1', secret } = {}) {
  const DB = makeD1();
  if (password) DB.raw.prepare("INSERT INTO settings (key, value) VALUES ('write_hash', ?)").run(await hashPassword(password));
  return { DB, ...VARS, ...(secret ? { WRITE_TOKEN: secret } : {}), ASSETS: { fetch: async () => new Response('asset') } };
}
const post = (path, body, { host = HUB, ip = '1.1.1.1', cookie } = {}) => new Request(`https://${host}${path}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body),
});
const tokenOf = res => /hub_session=([^;]*)/.exec(res.headers.get('Set-Cookie') || '')?.[1] || '';

test('표시 만들기·확인: 맞는 열쇠·기한 안에서만 통과', async () => {
  const k = await deriveKey('s', 'site:abc'), other = await deriveKey('s', 'site:changed');
  const { token, exp } = await makeToken(k, 1000, 1);
  assert.equal(exp, 1000 + 86400);
  assert.deepEqual(await verifyToken(k, token, 2000), { ok: true, exp });
  assert.equal((await verifyToken(other, token, 2000)).ok, false);   // 암호가 바뀌면 무효
  assert.equal((await verifyToken(k, token, exp)).ok, false);         // 기한 지남
  assert.equal((await verifyToken(k, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), 2000)).ok, false);
  for (const bad of ['', 'v1.1.x', 'v2.99999999999.' + 'a'.repeat(43), null]) assert.equal((await verifyToken(k, bad, 0)).ok, false);
});

test('쿠키: 내 도메인 아래면 Domain을 붙이고, 그 밖은 그 주소에서만', () => {
  assert.match(sessionCookie('t', { host: HUB, domain: 'woongstudio.com' }), /^hub_session=t; Path=\/; Domain=woongstudio\.com; Max-Age=7776000; Secure; HttpOnly; SameSite=Lax$/);
  assert.doesNotMatch(sessionCookie('t', { host: 'hub.tedcheon.workers.dev', domain: 'woongstudio.com' }), /Domain=/);
  assert.doesNotMatch(sessionCookie('t', { host: 'localhost:8787', domain: '' }), /Domain=/);
  assert.match(sessionCookie('', { host: HUB, domain: 'woongstudio.com', maxAge: 0 }), /Max-Age=0/);
  assert.equal(readCookie(new Request('https://x', { headers: { Cookie: 'a=1; hub_session=v1.2.abc ; b=2' } })), 'v1.2.abc');
  assert.equal(readCookie(new Request('https://x')), '');
});

test('돌아갈 주소: 같은 주인의 https만(남의 사이트·http·사용자 정보 거절), 내 컴퓨터 시험은 localhost끼리', () => {
  const ok = h => h.endsWith('.woongstudio.com') || h === 'haenya.pages.dev';
  assert.equal(safeReturn('https://rebalance.woongstudio.com/#portfolio', HUB, ok), 'https://rebalance.woongstudio.com/#portfolio');
  assert.equal(safeReturn('https://evil.com/', HUB, ok), null);
  assert.equal(safeReturn('http://rebalance.woongstudio.com/', HUB, ok), null);
  assert.equal(safeReturn('https://a:b@rebalance.woongstudio.com/', HUB, ok), null);
  assert.equal(safeReturn('javascript:alert(1)', HUB, ok), null);
  assert.equal(safeReturn('http://localhost:8788/', 'localhost:8787', ok), 'http://localhost:8788/');
  assert.equal(safeReturn('http://localhost:8788/', HUB, ok), null);
});

test('로그인: 틀리면 401, 맞으면 woongstudio.com 전체 쿠키 + 돌아갈 주소, 그 쿠키로 허브 편집·다른 앱 확인 가능', async () => {
  const env = await env0();
  assert.equal((await worker.fetch(post('/api/login', { password: 'nope' }), env)).status, 401);
  const r = await worker.fetch(post('/api/login', { password: 'hub-pass-1', return: 'https://rebalance.woongstudio.com/' }), env);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.next, 'https://rebalance.woongstudio.com/');
  assert.match(r.headers.get('Set-Cookie'), /Domain=woongstudio\.com/);
  const token = tokenOf(r);
  // 다른 앱의 서버가 묻는 확인
  assert.deepEqual(await (await worker.fetch(post('/api/session', { token }), env)).json(), { ok: true, exp: j.exp });
  assert.equal((await worker.fetch(post('/api/session', { token: token + 'x' }), env)).status, 401);
  // 허브 화면: 쿠키만으로 편집 가능
  const apps = await (await worker.fetch(new Request(`https://${HUB}/api/apps`, { headers: { Cookie: `hub_session=${token}` } }), env)).json();
  assert.equal(apps.canEdit, true);
  const me = await (await worker.fetch(new Request(`https://${HUB}/api/session`, { headers: { Cookie: `hub_session=${token}` } }), env)).json();
  assert.equal(me.loggedIn, true);
  // 남의 사이트로는 돌려보내지 않는다
  const evil = await (await worker.fetch(post('/api/login', { password: 'hub-pass-1', return: 'https://evil.com/' }), env)).json();
  assert.equal(evil.next, undefined);
});

test('로그인: 같은 접속 위치에서 10번 틀리면 429(맞는 암호도), 다른 위치는 영향 없음, 10분 지나면 풀림', async () => {
  const env = await env0();
  const t0 = Date.now();
  for (let i = 0; i < login.MAX_FAILS; i++) assert.equal((await login.POST({ request: post('/api/login', { password: 'x' }), env }, t0)).status, 401);
  assert.equal((await login.POST({ request: post('/api/login', { password: 'hub-pass-1' }), env }, t0)).status, 429);
  assert.equal((await login.POST({ request: post('/api/login', { password: 'hub-pass-1' }, { ip: '2.2.2.2' }), env }, t0)).status, 200);
  assert.equal((await login.POST({ request: post('/api/login', { password: 'hub-pass-1' }), env }, t0 + login.FAIL_WINDOW_MS + 1)).status, 200);
});

test('로그인: 허브 암호가 아직 없으면 409, 대시보드 비밀값이 있으면 그것으로', async () => {
  assert.equal((await worker.fetch(post('/api/login', { password: 'whatever' }), await env0({ password: null }))).status, 409);
  const env = await env0({ password: null, secret: 'dash-secret-1' });
  assert.equal((await worker.fetch(post('/api/login', { password: 'dash-secret-1' }), env)).status, 200);
});

test('로그아웃: 쿠키를 지우고, all이면 모든 기기의 표시가 무효. 암호를 바꿔도 무효', async () => {
  const env = await env0();
  const token = tokenOf(await worker.fetch(post('/api/login', { password: 'hub-pass-1' }), env));
  const out = await worker.fetch(post('/api/logout', {}, { cookie: `hub_session=${token}` }), env);
  assert.match(out.headers.get('Set-Cookie'), /hub_session=; .*Max-Age=0/);
  assert.equal((await (await worker.fetch(post('/api/session', { token }), env)).json()).ok, true); // 그냥 로그아웃은 이 브라우저만

  const all = await (await worker.fetch(post('/api/logout', { all: true }, { cookie: `hub_session=${token}` }), env)).json();
  assert.equal(all.all, true);
  assert.equal((await worker.fetch(post('/api/session', { token }), env)).status, 401);

  const t2 = tokenOf(await worker.fetch(post('/api/login', { password: 'hub-pass-1' }), env));
  env.DB.raw.prepare("UPDATE settings SET value = ? WHERE key = 'write_hash'").run(await hashPassword('new-pass-2'));
  assert.equal((await worker.fetch(post('/api/session', { token: t2 }), env)).status, 401);
  // 로그인 안 한 사람의 all은 무시
  assert.equal((await (await worker.fetch(post('/api/logout', { all: true }), env)).json()).all, false);
});
