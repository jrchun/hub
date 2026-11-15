// 테스트용 D1: Node 내장 SQLite(메모리)에 db/schema.sql을 적용하고 D1 바인딩 모양(prepare/bind/first/run/all/batch)으로 감싼다.
// 가짜 대신 실제 SQL을 돌려서 upsert·횟수 제한 같은 질의도 함께 확인한다.
import fs from 'node:fs';

// "SQLite는 실험 기능" 경고가 테스트 출력을 어지럽히지 않게 그 경고만 숨긴다.
const emit = process.emitWarning;
process.emitWarning = (w, ...a) => (String(w).includes('SQLite') ? undefined : emit.call(process, w, ...a));
const { DatabaseSync } = await import('node:sqlite');

const SCHEMA = fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; },
  });
  return {
    raw: db,
    prepare: sql => stmt(sql),
    batch: async list => {
      db.exec('BEGIN');
      try { const out = []; for (const s of list) out.push(await s.run()); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
  };
}
