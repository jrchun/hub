// 허브 규칙(src/lib/hub.js)과 등록·확인 API. 바깥 요청은 가짜 fetch, D1은 메모리 SQLite. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import {
  normalizeUrl, accountOf, ownerOf, allowedOwners, checkRegisterTarget, judge, checkApp, pickForCheck, checkMany, nextRow, toView, readLimited,
  fetchJson, MAX_CHECKS_PER_RUN,
} from '../src/lib/hub.js';
import { checkDue } from '../src/lib/store.js';
import * as register from '../src/api/register.js';
import * as refresh from '../src/api/refresh.js';
import { daily } from '../src/jobs.js';
import { makeD1 } from './d1_sqlite.js';

const HUB = 'hub.tedcheon.workers.dev';
const NEW_HEALTH = { ok: true, db: true, starter: 1, usage: { last30d: 5, lastUsedAt: '2026-11-14T09:00:00Z' } };
const META = { schema: 1, name: '운동 기록', emoji: '🏋️', summary: '오늘 운동', category: '건강', status: '운영중', public: true };

// 가짜 인터넷: { 'https://a.../app.json': 응답 } 형식. 값이 함수면 불러서 쓴다. 없는 주소는 404.
function fakeNet(map) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const v = map[url];
    if (typeof v === 'function') return v(init);
    if (v instanceof Error) throw v;
    if (v === undefined) return new Response('Not found', { status: 404 });
    if (v instanceof Response) return v;
    return new Response(JSON.stringify(v), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  fn.calls = calls;
  return fn;
}
const modernApp = url => ({ [url + '/app.json']: META, [url + '/api/health']: NEW_HEALTH });
const legacyApp = url => ({ [url + '/api/health']: { ok: true, db: true, writeTokenSet: true } }); // rebalance와 같은 모양

// ── 주소 정리·계정 비교 ───────────────────────────────────────

test('주소 정리: https://<호스트>로, 경로·쿼리 제거, 소문자', () => {
  assert.equal(normalizeUrl('https://Gym-Log.TedCheon.workers.dev/path?q=1#x'), 'https://gym-log.tedcheon.workers.dev');
  assert.equal(normalizeUrl('  http://a.b.workers.dev/  '), 'https://a.b.workers.dev');
});

test('이상한 주소는 거절', () => {
  for (const bad of [
    '', '   ', null, 42, {}, 'not a url', 'ftp://a.b.workers.dev', 'javascript:alert(1)', 'https://user:pw@a.b.workers.dev',
    'https://a.b.workers.dev:8443', 'https://127.0.0.1', 'https://localhost', 'https://-x.b.workers.dev', 'https://a_b.c.workers.dev',
    'https://' + 'a'.repeat(300) + '.workers.dev',
  ]) assert.equal(normalizeUrl(bad), null, String(bad));
});

test('계정 꺼내기: <앱>.<계정>.workers.dev만', () => {
  assert.equal(accountOf(HUB), 'tedcheon.workers.dev');
  assert.equal(accountOf('HUB.TedCheon.workers.dev:443'), 'tedcheon.workers.dev');
  assert.equal(accountOf('tedcheon.workers.dev'), null);
  assert.equal(accountOf('a.b.tedcheon.workers.dev'), null);
  assert.equal(accountOf('localhost:8787'), null);
  assert.equal(accountOf('hub.tedcheon.workers.dev.evil.com'), null);
});

test('등록 대상: 같은 계정만 받고, 다른 계정은 403, 허브 자신·이상한 주소는 400', () => {
  assert.deepEqual(checkRegisterTarget('https://rebalance.tedcheon.workers.dev/x', HUB), { ok: true, url: 'https://rebalance.tedcheon.workers.dev' });
  assert.equal(checkRegisterTarget('https://app.someone.workers.dev', HUB).status, 403);
  assert.equal(checkRegisterTarget('https://tedcheon.workers.dev', HUB).status, 403);
  assert.equal(checkRegisterTarget('https://evil.com', HUB).status, 403);
  assert.equal(checkRegisterTarget('https://x.tedcheon.workers.dev.evil.com', HUB).status, 403);
  assert.equal(checkRegisterTarget('https://HUB.tedcheon.workers.dev', HUB).status, 400);
  assert.equal(checkRegisterTarget('nope', HUB).status, 400);
  // 허브가 workers.dev가 아니면(예: 내 컴퓨터) 아무것도 받지 않는다
  assert.equal(checkRegisterTarget('https://a.tedcheon.workers.dev', 'localhost:8787').status, 403);
});

test('주인 꺼내기: 내 도메인 아래 주소와 workers.dev 계정, 함께 쓰는 주소는 아님', () => {
  assert.equal(ownerOf('gym-log.woongstudio.com'), 'woongstudio.com');
  assert.equal(ownerOf('Hub.WoongStudio.com:443'), 'woongstudio.com');
  assert.equal(ownerOf('a.my-site.co.kr'), 'my-site.co.kr');
  assert.equal(ownerOf(HUB), 'tedcheon.workers.dev');
  assert.equal(ownerOf('woongstudio.com'), null);       // 도메인 자체는 앱 주소가 아니다
  assert.equal(ownerOf('haenya.pages.dev'), null);      // 누구나 만드는 주소
  assert.equal(ownerOf('me.github.io'), null);
  assert.equal(ownerOf('a.b.tedcheon.workers.dev'), null);
  assert.equal(ownerOf('localhost:8787'), null);
  assert.equal(ownerOf('1.2.3.4'), null);
  assert.deepEqual([...allowedOwners('hub.woongstudio.com', 'tedcheon.workers.dev, woongstudio.com')], ['woongstudio.com', 'tedcheon.workers.dev']);
  assert.deepEqual([...allowedOwners(HUB, 'woongstudio.com')], ['tedcheon.workers.dev', 'woongstudio.com']);
  assert.deepEqual([...allowedOwners('localhost:8787', 'workers.dev,pages.dev,nodot,woongstudio.com')], ['woongstudio.com']); // 함께 쓰는 주소·이상한 값은 버림
});

test('등록 대상: 내 도메인으로 연 허브는 같은 도메인 앱 + OWNER_DOMAINS를 받는다', () => {
  const H = 'hub.woongstudio.com', O = 'woongstudio.com,tedcheon.workers.dev';
  assert.deepEqual(checkRegisterTarget('https://rebalance.woongstudio.com/', H), { ok: true, url: 'https://rebalance.woongstudio.com' });
  assert.equal(checkRegisterTarget('https://rebalance.tedcheon.workers.dev', H).status, 403);     // 설정 없으면 옛 주소는 안 받음
  assert.equal(checkRegisterTarget('https://rebalance.tedcheon.workers.dev', H, O).ok, true);     // 설정하면 받음
  assert.equal(checkRegisterTarget('https://rebalance.woongstudio.com', HUB, O).ok, true);        // workers.dev로 열어도 같음
  assert.equal(checkRegisterTarget('https://evil.com', H, O).status, 403);
  assert.equal(checkRegisterTarget('https://x.woongstudio.com.evil.com', H, O).status, 403);
  assert.equal(checkRegisterTarget('https://a.b.woongstudio.com', H, O).status, 403);
  assert.equal(checkRegisterTarget('https://haenya.pages.dev', H, O).status, 403);
  assert.equal(checkRegisterTarget('https://woongstudio.com', H, O).status, 403);
  assert.equal(checkRegisterTarget('https://hub.woongstudio.com', H, O).status, 400);             // 허브 자신
  assert.equal(checkRegisterTarget('https://hub.tedcheon.workers.dev', H, O).status, 400);        // 허브의 옛 주소도 자신
});

// ── 판정 ──────────────────────────────────────────────────────

const R = (status, json) => ({ status, json, text: json ? JSON.stringify(json) : null });

test('판정: 정상 / 허브 준비 전(app.json 없음 또는 starter 없음) / 응답 없음', () => {
  assert.equal(judge(R(200, META), R(200, NEW_HEALTH)), 'ok');
  assert.equal(judge(R(404, null), R(200, NEW_HEALTH)), 'legacy');                // app.json 없음
  assert.equal(judge(R(200, META), R(200, { ok: true, db: true })), 'legacy');      // starter 없음
  assert.equal(judge(R(404, null), R(200, { ok: true, writeTokenSet: true })), 'legacy'); // rebalance 모양
  assert.equal(judge(R(200, META), R(503, { ok: true, db: false })), 'down');       // 503
  assert.equal(judge(R(200, META), R(200, { ok: false })), 'down');
  assert.equal(judge(R(200, META), { error: '시간 초과' }), 'down');
  assert.equal(judge({ error: '연결 실패' }, { error: '연결 실패' }), 'down');
  assert.equal(judge(R(200, META), R(200, null)), 'down');                           // JSON 아님
});

test('앱 확인: 새 앱은 정상, 예전 앱은 허브 준비 전, 요청은 리다이렉트 안 따라감·제한 시간·User-Agent', async () => {
  const a = 'https://gym.tedcheon.workers.dev', b = 'https://rebalance.tedcheon.workers.dev';
  const net = fakeNet({ ...modernApp(a), ...legacyApp(b) });
  const ra = await checkApp(a, net), rb = await checkApp(b, net);
  assert.equal(ra.state, 'ok'); assert.deepEqual(JSON.parse(ra.metaText), META);
  assert.equal(rb.state, 'legacy'); assert.equal(rb.metaText, null);
  for (const c of net.calls) {
    assert.equal(c.init.redirect, 'manual');
    assert.ok(c.init.signal instanceof AbortSignal);
    assert.match(c.init.headers['User-Agent'], /app-hub/);
  }
  assert.deepEqual(net.calls.map(c => c.url).sort(), [a + '/api/health', a + '/app.json', b + '/api/health', b + '/app.json'].sort());
});

test('리다이렉트·너무 큰 응답·시간 초과는 실패', async () => {
  const u = 'https://x.tedcheon.workers.dev';
  const redirect = fakeNet({ [u + '/api/health']: new Response(null, { status: 302, headers: { Location: 'https://evil.com' } }) });
  assert.equal((await checkApp(u, redirect)).state, 'down');
  assert.equal((await checkApp(u, redirect)).note, '다른 주소로 넘김');

  const big = JSON.stringify({ ok: true, starter: 1, pad: 'x'.repeat(101 * 1024) });
  const tooBig = fakeNet({ [u + '/app.json']: META, [u + '/api/health']: () => new Response(big, { status: 200 }) });
  const r = await checkApp(u, tooBig);
  assert.equal(r.state, 'down'); assert.equal(r.note, '응답이 너무 큼');

  // Content-Length 없이 스트림으로 커지는 경우도 중간에 끊는다
  const stream = new ReadableStream({ pull(c) { c.enqueue(new Uint8Array(32 * 1024)); } });
  assert.equal(await readLimited(new Response(stream)), null);

  const slow = (url, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(init.signal.reason)));
  const keep = setTimeout(() => {}, 1000); // Node에서 AbortSignal.timeout 타이머는 프로세스를 붙잡지 않아서, 테스트가 끝날 때까지 붙잡아 둔다
  const t = await fetchJson(u + '/api/health', slow, 20);
  clearTimeout(keep);
  assert.equal(t.error, '시간 초과');
});

test('여러 앱 확인: 하나가 오류를 내도 나머지는 계속', async () => {
  const ok = 'https://a.tedcheon.workers.dev', bad = 'https://b.tedcheon.workers.dev';
  const net = fakeNet({ ...modernApp(ok), [bad + '/app.json']: new Error('boom'), [bad + '/api/health']: new Error('boom') });
  const out = await checkMany([bad, ok], net);
  assert.deepEqual(out.map(o => o.state), ['down', 'ok']);
});

test('25개 제한: 확인한 적 없는 앱 → 오래 확인 안 한 앱 순서로 25개만', () => {
  assert.equal(MAX_CHECKS_PER_RUN, 25);
  const apps = Array.from({ length: 30 }, (_, i) => ({ url: `https://a${String(i).padStart(2, '0')}.t.workers.dev`, checked_at: `2026-11-${String(i + 1).padStart(2, '0')}T00:00:00Z` }));
  apps[29].checked_at = null; // 한 번도 확인 안 함
  const picked = pickForCheck(apps);
  assert.equal(picked.length, 25);
  assert.equal(picked[0].url, apps[29].url);
  assert.equal(picked[1].url, apps[0].url);
  assert.ok(!picked.some(p => [apps[25], apps[26], apps[27], apps[28]].includes(p)), '가장 최근에 확인한 4개는 빠진다');
});

test('저장할 값: 연속 실패를 세고, 응답 없을 때도 예전 이름·사용량은 남긴다', () => {
  const t1 = '2026-11-01T00:00:00Z', t2 = '2026-11-02T00:00:00Z', t3 = '2026-11-03T00:00:00Z';
  const first = nextRow(null, { url: 'https://a.t.workers.dev', state: 'ok', metaText: '{"name":"A"}', healthText: '{"ok":true}' }, t1);
  assert.deepEqual([first.fail_count, first.ok_at, first.registered_at, first.hidden], [0, t1, t1, 0]);
  const down1 = nextRow({ ...first, hidden: 1 }, { url: first.url, state: 'down', metaText: null, healthText: null }, t2);
  const down2 = nextRow(down1, { url: first.url, state: 'down', metaText: null, healthText: null }, t3);
  assert.deepEqual([down2.fail_count, down2.ok_at, down2.meta, down2.health, down2.hidden, down2.registered_at], [2, t1, '{"name":"A"}', '{"ok":true}', 1, t1]);
  const back = nextRow(down2, { url: first.url, state: 'legacy', metaText: null, healthText: '{"ok":true}' }, t3);
  assert.deepEqual([back.fail_count, back.ok_at, back.meta], [0, t3, null]);
});

test('화면용 값: 원문에서 글자만 꺼내고, 그림 주소는 등록 주소로만 만든다', () => {
  const v = toView({
    url: 'https://a.t.workers.dev', state: 'ok', fail_count: 0, hidden: 0,
    meta: JSON.stringify({ ...META, name: '<img src=x onerror=alert(1)>', image: 'https://evil.com/x.png', og: 'https://evil.com', category: '이상함', public: false, summary: { evil: 1 } }),
    health: JSON.stringify({ ok: true, usage: { last30d: '7', lastUsedAt: '2026-11-10T00:00:00Z' } }),
  });
  assert.equal(v.image, 'https://a.t.workers.dev/og.png');
  assert.equal(v.name, '<img src=x onerror=alert(1)>'); // 글자 그대로 — 화면은 textContent로만 넣는다
  assert.equal(v.summary, '');
  assert.equal(v.category, '기타');
  assert.equal(v.public, false);
  assert.deepEqual(v.usage, { last30d: 7, lastUsedAt: '2026-11-10T00:00:00Z' });
  assert.ok(!JSON.stringify(v).includes('evil.com'));
  const legacy = toView({ url: 'https://r.t.workers.dev', state: 'legacy', meta: null, health: '{"ok":true}' });
  assert.deepEqual([legacy.hasMeta, legacy.public, legacy.usage, legacy.category], [false, true, null, '']);
  assert.equal(toView({ url: 'https://b.t.workers.dev', state: 'weird', meta: 'not json{' }).state, 'down');
});

// ── API (메모리 SQLite) ───────────────────────────────────────

const env0 = () => ({ DB: makeD1(), WRITE_TOKEN: 'secret', ASSETS: { fetch: async () => new Response('asset') } });
const regReq = (url, host = HUB) => new Request(`https://${host}/api/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
const reg = (env, url, net, host) => register.POST({ request: regReq(url, host), env }, net);

test('등록: 예전 앱(rebalance)도 받고 "허브 준비 전", 다시 오면 200, 1분 안에 다시 오면 429', async () => {
  const env = env0(), u = 'https://rebalance.tedcheon.workers.dev';
  const net = fakeNet(legacyApp(u));
  const r1 = await reg(env, u + '/some/path', net);
  assert.equal(r1.status, 201);
  const j1 = await r1.json();
  assert.equal(j1.state, 'legacy'); assert.equal(j1.stateText, '허브 준비 전'); assert.equal(j1.app.url, u);
  assert.equal((await reg(env, u, net)).status, 429);
  env.DB.raw.exec('UPDATE rate_limit SET at = at - 61000'); // 1분이 지난 것으로
  const r2 = await reg(env, u, fakeNet(modernApp(u)));
  assert.equal(r2.status, 200);
  assert.equal((await r2.json()).state, 'ok');
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM apps').get().n, 1);
});

test('등록: 다른 계정은 403, 이상한 주소는 400 — 어느 경우에도 바깥 요청을 하지 않는다', async () => {
  const env = env0(), net = fakeNet({});
  assert.equal((await reg(env, 'https://app.other.workers.dev', net)).status, 403);
  assert.equal((await reg(env, 'javascript:alert(1)', net)).status, 400);
  assert.equal((await reg(env, 'https://hub.tedcheon.workers.dev', net)).status, 400);
  const bad = await register.POST({ request: new Request(`https://${HUB}/api/register`, { method: 'POST', body: 'nope' }), env }, net);
  assert.equal(bad.status, 400);
  assert.equal(net.calls.length, 0);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM apps').get().n, 0);
});


test('등록 옮기기(replaces): 두 주소의 app.json이 같으면 옛 줄을 새 주소로 옮기고 숨김·등록일을 이어받는다', async () => {
  const env = { ...env0(), OWNER_DOMAINS: 'woongstudio.com' };
  const oldU = 'https://gym.tedcheon.workers.dev', newU = 'https://gym.woongstudio.com';
  await reg(env, oldU, fakeNet(modernApp(oldU)));
  env.DB.raw.exec(`UPDATE apps SET hidden = 1, registered_at = '2026-11-01T00:00:00Z'`);
  const r = await register.POST({ request: new Request(`https://${HUB}/api/register`, { method: 'POST', body: JSON.stringify({ url: newU, replaces: oldU + '/' }) }), env },
    fakeNet({ ...modernApp(oldU), ...modernApp(newU) }));
  const j = await r.json();
  assert.deepEqual([r.status, j.replaced, j.replacedFrom, j.app.url], [201, true, oldU, newU]);
  const rows = env.DB.raw.prepare('SELECT url, hidden, registered_at FROM apps').all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ url: newU, hidden: 1, registered_at: '2026-11-01T00:00:00Z' }]);
});

test('등록 옮기기(replaces): app.json이 다르거나 옛 줄이 없으면 옛 줄을 건드리지 않는다', async () => {
  const env = { ...env0(), OWNER_DOMAINS: 'woongstudio.com' };
  const oldU = 'https://gym.tedcheon.workers.dev', newU = 'https://other.woongstudio.com';
  await reg(env, oldU, fakeNet(modernApp(oldU)));
  const other = { [newU + '/app.json']: { ...META, name: '다른 앱' }, [newU + '/api/health']: NEW_HEALTH };
  const req = (url, replaces) => new Request(`https://${HUB}/api/register`, { method: 'POST', body: JSON.stringify({ url, replaces }) });
  const j = await (await register.POST({ request: req(newU, oldU), env }, fakeNet({ ...modernApp(oldU), ...other }))).json();
  assert.equal(j.replaced, false);
  assert.match(j.replaceNote, /달라/);
  assert.equal(env.DB.raw.prepare('SELECT COUNT(*) AS n FROM apps').get().n, 2);
  const none = await (await register.POST({ request: req('https://x.woongstudio.com', 'https://nope.tedcheon.workers.dev'), env }, fakeNet(modernApp('https://x.woongstudio.com')))).json();
  assert.deepEqual([none.replaced, /없습니다/.test(none.replaceNote)], [false, true]);
  // 옛 주소가 다른 주인이면 아무것도 하지 않고 403
  assert.equal((await register.POST({ request: req('https://y.woongstudio.com', 'https://a.other.workers.dev'), env }, fakeNet({}))).status, 403);
});

test('등록: 응답 없는 앱도 등록은 되고 "응답 없음"', async () => {
  const env = env0(), u = 'https://gone.tedcheon.workers.dev';
  const r = await reg(env, u, fakeNet({ [u + '/app.json']: new Error('x'), [u + '/api/health']: new Error('x') }));
  assert.equal(r.status, 201);
  const j = await r.json();
  assert.equal(j.state, 'down'); assert.equal(j.app.failCount, 1);
});

test('worker 라우팅: /api/register는 요청 주소의 계정으로 비교한다', async () => {
  const env = env0();
  const r = await worker.fetch(regReq('https://app.other.workers.dev'), env);
  assert.equal(r.status, 403);
});

test('목록·숨기기·삭제: 편집 암호가 없으면 401, 숨긴 앱은 암호 없는 사람에게 안 보인다', async () => {
  const env = env0();
  const a = 'https://a.tedcheon.workers.dev', b = 'https://b.tedcheon.workers.dev';
  await reg(env, a, fakeNet(modernApp(a)));
  await reg(env, b, fakeNet(legacyApp(b)));
  const call = (method, path, body, auth) => worker.fetch(new Request(`https://${HUB}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer ' + auth } : {}) }, body: body ? JSON.stringify(body) : undefined,
  }), env);

  let j = await (await call('GET', '/api/apps')).json();
  assert.equal(j.canEdit, false); assert.equal(j.apps.length, 2);
  assert.equal((await call('PUT', '/api/apps', { url: a, hidden: true })).status, 401);
  assert.equal((await call('PUT', '/api/apps', { url: a, hidden: true }, 'wrong')).status, 401);
  assert.equal((await call('PUT', '/api/apps', { url: a, hidden: true }, 'secret')).status, 200);
  assert.equal((await call('PUT', '/api/apps', { url: 'https://zz.tedcheon.workers.dev', hidden: true }, 'secret')).status, 404);
  assert.equal((await call('PUT', '/api/apps', { url: a, hidden: 'yes' }, 'secret')).status, 422);

  j = await (await call('GET', '/api/apps')).json();
  assert.deepEqual(j.apps.map(x => x.url), [b]);           // 숨긴 앱은 빠진다
  j = await (await call('GET', '/api/apps', null, 'secret')).json();
  assert.equal(j.canEdit, true); assert.equal(j.apps.length, 2);
  assert.equal(j.apps.find(x => x.url === a).hidden, true);

  assert.equal((await call('DELETE', '/api/apps?url=' + encodeURIComponent(b))).status, 401);
  assert.equal((await call('DELETE', '/api/apps?url=' + encodeURIComponent(b), null, 'secret')).status, 200);
  assert.equal((await call('DELETE', '/api/apps?url=' + encodeURIComponent(b), null, 'secret')).status, 404);
  j = await (await call('GET', '/api/apps', null, 'secret')).json();
  assert.deepEqual(j.apps.map(x => x.url), [a]);
});

test('지금 확인(/api/refresh)과 매일 예약 작업: 같은 동작, 최대 25개(바깥 요청 50개)', async () => {
  const env = env0(), net = fakeNet({});
  const now = '2026-11-10T00:00:00Z';
  const ins = env.DB.raw.prepare('INSERT INTO apps (url, state, registered_at, checked_at) VALUES (?, ?, ?, ?)');
  for (let i = 0; i < 30; i++) ins.run(`https://a${i}.tedcheon.workers.dev`, 'ok', now, `2026-11-01T00:00:${String(i).padStart(2, '0')}Z`);

  assert.equal((await refresh.POST({ request: new Request(`https://${HUB}/api/refresh`, { method: 'POST' }), env }, net)).status, 401);
  const r = await refresh.POST({ request: new Request(`https://${HUB}/api/refresh`, { method: 'POST', headers: { Authorization: 'Bearer secret' } }), env }, net);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { total: 30, checked: 25, ok: 0, down: 25, legacy: 0 });
  assert.equal(net.calls.length, 50);
  // 확인 안 된 5개(가장 최근에 확인한 a25~a29)가 다음 예약 작업에서 먼저 확인된다
  const net2 = fakeNet({});
  const note = await daily(env, net2);
  assert.match(note, /앱 30개 중 25개 확인/);
  const first5 = [...new Set(net2.calls.slice(0, 10).map(c => new URL(c.url).host))];
  for (let i = 25; i < 30; i++) assert.ok(first5.includes(`a${i}.tedcheon.workers.dev`) || net2.calls.some(c => c.url.startsWith(`https://a${i}.`)));
  const fails = env.DB.raw.prepare("SELECT fail_count FROM apps WHERE url = 'https://a0.tedcheon.workers.dev'").get().fail_count;
  assert.equal(fails, 2); // 두 번 연속 실패
  assert.equal(env.DB.raw.prepare("SELECT COUNT(*) AS n FROM job_log WHERE job = 'daily'").get().n, 1);
});

test('checkDue: 등록된 앱이 없으면 바깥 요청 없음', async () => {
  const env = env0(), net = fakeNet({});
  assert.deepEqual(await checkDue(env, net), { total: 0, checked: 0, ok: 0, down: 0, legacy: 0 });
  assert.equal(net.calls.length, 0);
});
