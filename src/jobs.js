// 예약 작업(Cron Trigger). wrangler.toml의 [triggers] crons 시각(매일 08:00 KST)에 Cloudflare가 worker.js의 scheduled()를 부른다.
// Worker 안에서 바로 D1과 다른 앱 주소에 닿으므로 GitHub 비밀이나 API 토큰이 필요 없다.
import { nowIso } from './lib/http.js';
import { checkDue } from './lib/store.js';

// 매일 둘러보기: 등록된 앱마다 /app.json과 /api/health를 읽어 저장한다(src/lib/store.js checkDue).
// 무료 플랜은 한 번 실행에 바깥 요청이 50개까지라, 앱당 2개씩 → 오래 확인 안 한 앱부터 25개까지만 확인한다.
// 앱 하나가 실패해도 나머지는 계속 확인하고, 요청마다 10초 제한이 있다(src/lib/hub.js).
export async function daily(env, fetchFn = fetch) {
  const s = await checkDue(env, fetchFn);
  const note = `앱 ${s.total}개 중 ${s.checked}개 확인: 정상 ${s.ok}, 응답 없음 ${s.down}, 허브 준비 전 ${s.legacy}`;
  await env.DB.prepare('INSERT INTO job_log (ts, job, note) VALUES (?, ?, ?)').bind(nowIso(), 'daily', note).run();
  // 기록이 끝없이 쌓이지 않게 90일 넘은 것은 지운다.
  await env.DB.prepare("DELETE FROM job_log WHERE ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-90 days')").run();
  return note;
}

export async function runScheduled(env, fetchFn = fetch) {
  if (!env.DB) return '할 일 없음';
  return daily(env, fetchFn);
}
