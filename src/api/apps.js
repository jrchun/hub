// GET    /api/apps                 → {apps, canEdit}  (로그인 안 한 사람: 숨긴 앱은 빼고, 카드에 필요한 값만 보낸다)
// PUT    /api/apps {url, hidden}   → {ok}             편집 암호 필요(401). 숨기기/보이기
// DELETE /api/apps?url=<주소>      → {ok}             편집 암호 필요(401). 삭제(화면에서 한 번 더 확인한다)
import { json, canWrite, logUsage } from '../lib/http.js';
import { normalizeUrl, toView, publicView } from '../lib/hub.js';
import { listApps } from '../lib/store.js';

export async function GET({ request, env }) {
  const canEdit = await canWrite(request, env);
  if (canEdit) await logUsage(env, 'open');
  const all = (await listApps(env)).map(toView);
  const apps = canEdit ? all : all.filter(a => !a.hidden).map(publicView);
  return json({ apps, canEdit });
}

export async function PUT({ request, env }) {
  if (!(await canWrite(request, env))) return json({ detail: '편집 암호가 필요합니다.' }, 401);
  let body;
  try { body = await request.json(); } catch { return json({ detail: 'JSON이 아닙니다.' }, 400); }
  const url = normalizeUrl(body?.url);
  if (!url || typeof body.hidden !== 'boolean') return json({ detail: '{url, hidden} 형식이어야 합니다.' }, 422);
  const r = await env.DB.prepare('UPDATE apps SET hidden = ? WHERE url = ?').bind(body.hidden ? 1 : 0, url).run();
  if (r.meta.changes !== 1) return json({ detail: '등록되지 않은 주소입니다.' }, 404);
  await logUsage(env, 'save');
  return json({ ok: true });
}

export async function DELETE({ request, env }) {
  if (!(await canWrite(request, env))) return json({ detail: '편집 암호가 필요합니다.' }, 401);
  const url = normalizeUrl(new URL(request.url).searchParams.get('url') || '');
  if (!url) return json({ detail: '?url=<주소>가 필요합니다.' }, 422);
  const r = await env.DB.prepare('DELETE FROM apps WHERE url = ?').bind(url).run();
  if (r.meta.changes !== 1) return json({ detail: '등록되지 않은 주소입니다.' }, 404);
  await logUsage(env, 'save');
  return json({ ok: true });
}
