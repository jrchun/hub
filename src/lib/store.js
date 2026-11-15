// apps 표 읽기·쓰기와 "확인해서 저장하기". 규칙은 src/lib/hub.js의 순수 함수에 있다.
import { checkMany, nextRow, pickForCheck, MAX_CHECKS_PER_RUN } from './hub.js';
import { nowIso } from './http.js';

const COLS = 'url, meta, health, state, fail_count, checked_at, ok_at, registered_at, hidden';

export async function listApps(env) {
  const r = await env.DB.prepare(`SELECT ${COLS} FROM apps`).all();
  return r.results || [];
}

export async function getApp(env, url) {
  return env.DB.prepare(`SELECT ${COLS} FROM apps WHERE url = ?`).bind(url).first();
}

const upsert = (env, row) => env.DB.prepare(
  `INSERT INTO apps (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(url) DO UPDATE SET meta = excluded.meta, health = excluded.health, state = excluded.state,
     fail_count = excluded.fail_count, checked_at = excluded.checked_at, ok_at = excluded.ok_at`
).bind(row.url, row.meta, row.health, row.state, row.fail_count, row.checked_at, row.ok_at, row.registered_at, row.hidden);

// 주소들을 확인하고 결과를 한 번에(batch) 저장한다. prevByUrl: 지금 저장된 행. → 저장한 행 목록
export async function checkAndSave(env, urls, prevByUrl = {}, fetchFn = fetch) {
  if (!urls.length) return [];
  const results = await checkMany(urls, fetchFn);
  const now = nowIso();
  const rows = results.map(r => nextRow(prevByUrl[r.url], r, now));
  await env.DB.batch(rows.map(row => upsert(env, row)));
  return rows.map((row, i) => ({ ...row, note: results[i].note }));
}

// 등록된 앱 중 오래 확인 안 한 것부터 최대 25개를 확인한다(예약 작업·"지금 확인" 버튼이 같이 쓴다).
export async function checkDue(env, fetchFn = fetch) {
  const all = await listApps(env);
  const picked = pickForCheck(all, MAX_CHECKS_PER_RUN);
  const prev = Object.fromEntries(all.map(a => [a.url, a]));
  const rows = await checkAndSave(env, picked.map(a => a.url), prev, fetchFn);
  const count = s => rows.filter(r => r.state === s).length;
  return { total: all.length, checked: rows.length, ok: count('ok'), down: count('down'), legacy: count('legacy') };
}

// 같은 key는 windowMs 안에 한 번만 통과한다. 통과하면 true.
export async function rateLimit(env, key, windowMs = 60_000, now = Date.now()) {
  const r = await env.DB.prepare(
    `INSERT INTO rate_limit (key, at) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET at = excluded.at WHERE rate_limit.at <= ?`
  ).bind(key, now, now - windowMs).run();
  return r.meta.changes === 1;
}
