// 예약 작업(src/jobs.js)과 Worker의 scheduled() 연결. D1은 메모리 SQLite, 바깥 요청은 가짜 fetch. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
import { daily, runScheduled } from '../src/jobs.js';
import { makeD1 } from './d1_sqlite.js';

const offline = async () => { throw new Error('offline'); };

test('daily: 등록된 앱을 확인하고 job_log에 남긴다', async () => {
  const DB = makeD1();
  DB.raw.prepare("INSERT INTO apps (url, state, registered_at) VALUES ('https://a.t.workers.dev', 'ok', '2026-11-01T00:00:00Z')").run();
  const note = await daily({ DB }, offline);
  assert.equal(note, '앱 1개 중 1개 확인: 정상 0, 응답 없음 1, 허브 준비 전 0');
  const row = DB.raw.prepare("SELECT job, note FROM job_log").get();
  assert.deepEqual({ ...row }, { job: 'daily', note });
  assert.equal(DB.raw.prepare('SELECT fail_count FROM apps').get().fail_count, 1);
});

test('daily: 90일 넘은 job_log는 지운다', async () => {
  const DB = makeD1();
  DB.raw.prepare("INSERT INTO job_log VALUES ('2020-01-01T00:00:00Z', 'daily', 'old')").run();
  await daily({ DB }, offline);
  assert.equal(DB.raw.prepare("SELECT COUNT(*) AS n FROM job_log WHERE note = 'old'").get().n, 0);
});

test('runScheduled: D1이 없으면 할 일 없음', async () => {
  assert.equal(await runScheduled({}), '할 일 없음');
});

test('worker.scheduled가 작업을 waitUntil로 넘긴다', async () => {
  const DB = makeD1(), waits = [];
  const logs = []; const orig = console.log; console.log = (...a) => logs.push(a);
  try {
    await worker.scheduled({ cron: '0 23 * * *' }, { DB }, { waitUntil: p => waits.push(p) });
    await Promise.all(waits);
  } finally { console.log = orig; }
  assert.equal(DB.raw.prepare('SELECT COUNT(*) AS n FROM job_log').get().n, 1);
  assert.match(String(logs[0]), /예약 작업 완료/);
});
