// POST /api/register {url} → 201(새로 등록) | 200(이미 있음, 정보만 새로 고침) {app}
//   400 이상한 주소·허브 자신 | 403 다른 계정 주소 | 429 같은 주소를 1분 안에 다시 요청
// 비밀값이 없다. 대신 허브와 같은 계정(<계정>.workers.dev)의 주소만 받고, 허브가 그 주소를 직접 읽어 확인한다.
// 앱은 배포될 때 스스로 부른다(app_starter docs/AGENT_SETUP.md 7절 7번).
import { json } from '../lib/http.js';
import { checkRegisterTarget, toView } from '../lib/hub.js';
import { checkAndSave, getApp, rateLimit } from '../lib/store.js';

export async function POST({ request, env }, fetchFn = fetch) {
  let body;
  try { body = await request.json(); } catch { return json({ detail: 'JSON이 아닙니다. {"url": "https://..."} 형식으로 보내 주세요.' }, 400); }
  const target = checkRegisterTarget(body?.url, new URL(request.url).host);
  if (!target.ok) return json({ detail: target.detail }, target.status);
  if (!(await rateLimit(env, target.url))) return json({ detail: '같은 주소는 1분에 한 번만 등록할 수 있습니다.' }, 429);

  const prev = await getApp(env, target.url);
  const [row] = await checkAndSave(env, [target.url], prev ? { [target.url]: prev } : {}, fetchFn);
  const STATE_KO = { ok: '정상', down: '응답 없음', legacy: '허브 준비 전' };
  return json({
    registered: !prev, state: row.state, stateText: STATE_KO[row.state], note: row.note || undefined,
    app: toView(row),
  }, prev ? 200 : 201);
}
