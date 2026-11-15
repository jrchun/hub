// POST /api/refresh → {total, checked, ok, down, legacy}   편집 암호 필요(401)
// "지금 확인" 버튼. 매일 예약 작업(src/jobs.js daily)과 같은 동작이다(오래 확인 안 한 앱부터 최대 25개).
import { json, canWrite, logUsage } from '../lib/http.js';
import { checkDue } from '../lib/store.js';

export async function POST({ request, env }, fetchFn = fetch) {
  if (!(await canWrite(request, env))) return json({ detail: '편집 암호가 필요합니다.' }, 401);
  const summary = await checkDue(env, fetchFn);
  await logUsage(env, 'save');
  return json(summary);
}
