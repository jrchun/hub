// 배포된 사이트를 검사한다. 사용법: node scripts/check_site.mjs https://my-app.<계정>.workers.dev
// 화면·API·D1 연결·편집 암호 보호를 확인하고, 하나라도 실패하면 종료 코드 1.
// 앱 허브 준비(app.json·starter·og.png, docs/HUB.md)는 "경고"만 한다. 예전 앱에도 이 스크립트를 쓸 수 있게.
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(base)) { console.error('사이트 주소를 넣어 주세요. 예: node scripts/check_site.mjs https://my-app.me.workers.dev'); process.exit(2); }

const checks = []; // [상태('ok'|'FAIL'|'warn'), 이름, 설명]
async function check(name, fn, { warnOnly = false } = {}) {
  try { const note = await fn(); checks.push(['ok', name, note || '']); }
  catch (e) { checks.push([warnOnly ? 'warn' : 'FAIL', name, e.message]); }
}
const hub = (name, fn) => check(name, fn, { warnOnly: true });
const expect = (cond, msg) => { if (!cond) throw new Error(msg); };

await check('첫 화면', async () => {
  const r = await fetch(base + '/'); expect(r.ok, 'HTTP ' + r.status);
  expect((r.headers.get('content-type') || '').includes('text/html'), 'HTML이 아님');
});
let health = {};
await check('Worker·DB 연결 (/api/health)', async () => {
  const r = await fetch(base + '/api/health'); const j = await r.json().catch(() => ({})); health = j;
  expect(r.ok && j.db, 'D1에 연결되지 않음: HTTP ' + r.status + ' ' + JSON.stringify(j));
  const set = j.passwordSet ?? j.writeTokenSet;
  return set ? 'D1 모드, 편집 암호 정해짐' : '알림: 편집 암호가 아직 없음 — 사이트에서 처음 저장할 때 정한다(주소를 공유하기 전에 정할 것)';
});
// 앱 허브 API. 읽기는 누구나, 고치기는 편집 암호, 등록은 같은 계정 주소만.
await check('앱 목록 (/api/apps)', async () => {
  const r = await fetch(base + '/api/apps'); const j = await r.json().catch(() => ({}));
  expect(r.ok && Array.isArray(j.apps), 'HTTP ' + r.status);
  return `앱 ${j.apps.length}개`;
});
await check('암호 없이 "지금 확인"하면 거절', async () => {
  const r = await fetch(base + '/api/refresh', { method: 'POST' });
  expect(r.status === 401, '401이어야 하는데 ' + r.status);
});
await check('다른 계정 주소 등록은 거절(403)', async () => {
  const r = await fetch(base + '/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: 'https://app.not-my-account-check.workers.dev' }) });
  expect(r.status === 403, '403이어야 하는데 ' + r.status);
});
await hub('앱 허브: 자기소개서 (/app.json)', async () => {
  const r = await fetch(base + '/app.json'); expect(r.ok, 'HTTP ' + r.status + ' — web/app.json이 없음(docs/HUB.md)');
  const j = await r.json().catch(() => null); expect(j && typeof j === 'object', 'JSON이 아님');
  const missing = ['schema', 'name', 'summary', 'status'].filter(k => !j[k]);
  expect(!missing.length, '빠진 필드: ' + missing.join(', '));
  return `${j.emoji || ''} ${j.name} · ${j.status}`.trim();
});
await hub('앱 허브: 버전 (/api/health의 starter)', async () => {
  expect(health.starter, 'starter 값이 없음 — 허브 준비 전 예전 앱(docs/HUB.md 2번)');
  const u = health.usage;
  return `starter ${health.starter}` + (u ? `, 최근 30일 사용 ${u.last30d}회` : '');
});
await hub('앱 허브: 대표 화면 (/og.png)', async () => {
  const r = await fetch(base + '/og.png'); expect(r.ok, 'HTTP ' + r.status + ' — node scripts/og_shot.mjs로 찍어 커밋');
  expect((r.headers.get('content-type') || '').includes('image/png'), 'PNG가 아님');
  const kb = Math.round((await r.arrayBuffer()).byteLength / 1024);
  return kb + 'KB' + (kb > 200 ? ' (200KB보다 큼)' : '');
});
await check('없는 주소는 404', async () => {
  const r = await fetch(base + '/no-such-page-' + Date.now()); expect(r.status === 404, 'HTTP ' + r.status);
});

for (const [state, name, note] of checks) console.log(`${state.padEnd(4)} ${name}${note ? ' — ' + note : ''}`);
process.exit(checks.some(c => c[0] === 'FAIL') ? 1 : 0);
