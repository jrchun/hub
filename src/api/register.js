// POST /api/register {url, replaces?} → 201(새로 등록) | 200(이미 있음, 정보만 새로 고침) {app}
//   400 이상한 주소·허브 자신 | 403 다른 주인의 주소 | 429 같은 주소를 1분 안에 다시 요청
// 비밀값이 없다. 대신 허브와 같은 주인(내 도메인 woongstudio.com, 또는 <계정>.workers.dev, wrangler.toml OWNER_DOMAINS)의
// 주소만 받고, 허브가 그 주소를 직접 읽어 확인한다. 앱은 배포될 때 스스로 부른다(app_starter docs/AGENT_SETUP.md 7절 7번).
// replaces: 주소를 옮긴 앱의 옛 주소. 두 주소의 app.json이 같으면 옛 줄을 새 주소로 옮긴다(app_starter docs/DOMAIN.md).
import { json } from '../lib/http.js';
import { checkRegisterTarget, toView } from '../lib/hub.js';
import { checkAndSave, getApp, moveApp, rateLimit } from '../lib/store.js';

export async function POST({ request, env }, fetchFn = fetch) {
  let body;
  try { body = await request.json(); } catch { return json({ detail: 'JSON이 아닙니다. {"url": "https://..."} 형식으로 보내 주세요.' }, 400); }
  const hubHost = new URL(request.url).host;
  const target = checkRegisterTarget(body?.url, hubHost, env.OWNER_DOMAINS);
  if (!target.ok) return json({ detail: target.detail }, target.status);
  let old = null;
  if (body?.replaces !== undefined && body?.replaces !== null) {
    old = checkRegisterTarget(body.replaces, hubHost, env.OWNER_DOMAINS);
    if (!old.ok) return json({ detail: '옛 주소(replaces): ' + old.detail }, old.status);
    if (old.url === target.url) old = null;
  }
  if (!(await rateLimit(env, target.url))) return json({ detail: '같은 주소는 1분에 한 번만 등록할 수 있습니다.' }, 429);

  const prev = await getApp(env, target.url);
  let [row] = await checkAndSave(env, [target.url], prev ? { [target.url]: prev } : {}, fetchFn);
  let moved;
  if (old) {
    moved = await moveApp(env, old.url, row, fetchFn);
    if (moved.replaced) row = { ...moved.row, note: row.note };
  }
  const STATE_KO = { ok: '정상', down: '응답 없음', legacy: '허브 준비 전' };
  return json({
    registered: !prev, state: row.state, stateText: STATE_KO[row.state], note: row.note || undefined,
    replaced: moved ? moved.replaced : undefined, replacedFrom: moved?.replaced ? old.url : undefined, replaceNote: moved?.reason,
    app: toView(row),
  }, prev ? 200 : 201);
}
