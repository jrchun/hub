// 앱 허브의 규칙: 주소 정리, 계정 비교, 앱 확인(app.json·health 읽기), 판정, 확인할 앱 고르기.
// 판정·정렬·주소 정리·계정 비교는 DOM과 D1에 닿지 않는 순수 함수로 두고 tests/hub.test.js에서 확인한다.
// 앱에서 받은 글자는 믿지 않는다: 크기 제한(100KB), 리다이렉트 안 따라감, 화면에 쓸 값은 글자로만 꺼낸다.

export const MAX_BODY = 100 * 1024;      // 앱 응답이 이보다 크면 버리고 실패로 본다
export const TIMEOUT_MS = 10_000;        // 요청마다 제한 시간
// 무료 플랜은 한 번 실행(요청 하나·예약 작업 한 번)에 바깥 요청(fetch)이 50개까지다.
// 앱 하나를 확인할 때 app.json과 /api/health 두 개를 쓰므로 한 번에 25개까지만 확인한다.
// 25개를 넘으면 오래 확인 안 한 앱부터 25개를 고른다(pickForCheck). 나머지는 다음 실행 때 확인된다.
// (D1 질의는 "Cloudflare 내부 요청"이라 따로 1000개 한도다. developers.cloudflare.com/workers/platform/limits)
export const FETCHES_PER_APP = 2;
export const MAX_CHECKS_PER_RUN = Math.floor(50 / FETCHES_PER_APP);
// 한 번에 열어 둘 수 있는 연결이 6개라 앱 3개(요청 6개)씩 확인한다.
export const CONCURRENCY = 3;
export const USER_AGENT = 'app-hub/1 (+https://github.com/jrchun/hub)'; // workers.dev 브라우저 검사(1010)를 피하려면 필요

const WORKERS_DEV = '.workers.dev';
const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// 입력을 https://<호스트> 로 정리한다. 경로·쿼리·조각은 버리고 소문자로. 이상하면 null.
// 받는 것: http(s) 주소만, 사용자 정보(user:pw@)·포트·IP 주소는 받지 않는다.
export function normalizeUrl(input) {
  if (typeof input !== 'string') return null;
  const s = input.trim();
  if (!s || s.length > 300) return null;
  let u;
  try { u = new URL(s); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const labels = host.split('.');
  if (labels.length < 2 || !labels.every(l => LABEL_RE.test(l))) return null;
  if (/^\d+$/.test(labels.at(-1))) return null; // IP 주소
  return 'https://' + host;
}

// <앱>.<계정>.workers.dev → <계정>.workers.dev. workers.dev 앱 주소가 아니면 null.
export function accountOf(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  if (!h.endsWith(WORKERS_DEV)) return null;
  const labels = h.split('.');
  if (labels.length !== 4 || !labels.every(l => LABEL_RE.test(l))) return null;
  return labels.slice(1).join('.');
}

// 등록 요청을 받아도 되는가. hubHost: 허브 자신의 호스트(요청 주소에서 꺼냄). 설정값을 따로 두지 않는다.
// → { ok: true, url } | { ok: false, status, detail }
export function checkRegisterTarget(input, hubHost) {
  const url = normalizeUrl(input);
  if (!url) return { ok: false, status: 400, detail: '주소 형식이 이상합니다. 예: https://my-app.<계정>.workers.dev' };
  const host = url.slice('https://'.length);
  const hubAccount = accountOf(hubHost);
  if (!hubAccount) return { ok: false, status: 403, detail: '허브 주소가 workers.dev가 아니라 계정을 비교할 수 없습니다.' };
  if (accountOf(host) !== hubAccount) return { ok: false, status: 403, detail: '허브와 같은 계정의 앱만 등록할 수 있습니다.' };
  if (host === String(hubHost).toLowerCase().replace(/:\d+$/, '')) return { ok: false, status: 400, detail: '허브 자신은 등록하지 않습니다.' };
  return { ok: true, url };
}

// ── 앱 확인 ───────────────────────────────────────────────────

// 응답 본문을 최대 max 바이트까지만 읽는다. 넘으면 null(버린다).
export async function readLimited(res, max = MAX_BODY) {
  const len = Number(res.headers.get('content-length'));
  if (len > max) { try { await res.body?.cancel(); } catch { /* 무시 */ } return null; }
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { try { await reader.cancel(); } catch { /* 무시 */ } return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size); let off = 0;
  for (const c of chunks) { all.set(c, off); off += c.byteLength; }
  return new TextDecoder().decode(all);
}

// 주소 하나를 JSON으로 읽는다. → { status, json, text } | { error }
// 리다이렉트는 따라가지 않는다(redirect: 'manual' → 3xx는 실패).
export async function fetchJson(url, fetchFn = fetch, timeoutMs = TIMEOUT_MS) {
  let res;
  try {
    res = await fetchFn(url, {
      redirect: 'manual',
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    return { error: e?.name === 'TimeoutError' ? '시간 초과' : '연결 실패' };
  }
  if (res.status >= 300 && res.status < 400) { try { await res.body?.cancel(); } catch { /* 무시 */ } return { status: res.status, error: '다른 주소로 넘김' }; }
  let text;
  try { text = await readLimited(res); } catch { return { status: res.status, error: '읽기 실패' }; }
  if (text === null) return { status: res.status, error: '응답이 너무 큼' };
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!json || typeof json !== 'object' || Array.isArray(json)) json = null;
  return { status: res.status, json, text: json ? text : null };
}

// 판정(순수 함수). meta: app.json 결과, health: /api/health 결과(fetchJson 형식).
//   ok(정상): health가 ok이고 app.json과 starter가 있다
//   legacy(허브 준비 전): health는 ok인데 app.json이 없거나 starter가 없다
//   down(응답 없음): health가 실패했거나 ok가 아니다
export function judge(meta, health) {
  const alive = !!(health && !health.error && health.status === 200 && health.json && health.json.ok === true);
  if (!alive) return 'down';
  const hasMeta = !!(meta && !meta.error && meta.status === 200 && meta.json);
  const hasStarter = health.json.starter !== undefined && health.json.starter !== null;
  return hasMeta && hasStarter ? 'ok' : 'legacy';
}

// 앱 하나를 확인한다. → { url, state, metaText, healthText, note }
export async function checkApp(url, fetchFn = fetch, timeoutMs = TIMEOUT_MS) {
  const [meta, health] = await Promise.all([
    fetchJson(url + '/app.json', fetchFn, timeoutMs),
    fetchJson(url + '/api/health', fetchFn, timeoutMs),
  ]);
  const state = judge(meta, health);
  const metaOk = meta && !meta.error && meta.status === 200 && meta.json;
  const note = state === 'down' ? (health.error || 'HTTP ' + health.status) : '';
  return {
    url, state,
    metaText: metaOk ? meta.text : null,
    // 응답이 왔으면 health 원문을 저장한다(503이어도 무엇이 문제인지 볼 수 있게).
    healthText: health && health.json ? health.text : null,
    note,
  };
}

// 이번에 확인할 앱을 고른다(순수 함수). 오래 확인 안 한 앱부터(확인한 적 없는 앱이 맨 먼저), 최대 limit개.
export function pickForCheck(apps, limit = MAX_CHECKS_PER_RUN) {
  return [...apps]
    .sort((a, b) => {
      const x = a.checked_at || '', y = b.checked_at || '';
      return x < y ? -1 : x > y ? 1 : String(a.url).localeCompare(String(b.url));
    })
    .slice(0, limit);
}

// 여러 앱을 CONCURRENCY개씩 확인한다. 하나가 실패해도(예외) 나머지는 계속한다.
export async function checkMany(urls, fetchFn = fetch, timeoutMs = TIMEOUT_MS) {
  const out = new Array(urls.length);
  let next = 0;
  async function worker() {
    while (next < urls.length) {
      const i = next++;
      try { out[i] = await checkApp(urls[i], fetchFn, timeoutMs); }
      catch (e) { out[i] = { url: urls[i], state: 'down', metaText: null, healthText: null, note: '확인 중 오류' }; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));
  return out;
}

// 확인 결과를 저장할 값으로 바꾼다(순수 함수). prev: 지금 저장된 행(없으면 새로 등록).
// 앱이 잠깐 응답하지 않을 때 예전 이름·사용량이 지워지지 않도록, 새로 받은 원문이 없으면 예전 원문을 남긴다.
// 단, 응답은 했는데 app.json이 없으면(허브 준비 전) 예전 app.json은 지운다.
export function nextRow(prev, result, now) {
  const down = result.state === 'down';
  return {
    url: result.url,
    meta: result.metaText ?? (down ? prev?.meta ?? null : null),
    health: result.healthText ?? prev?.health ?? null,
    state: result.state,
    fail_count: down ? (prev?.fail_count || 0) + 1 : 0,
    checked_at: now,
    ok_at: down ? prev?.ok_at ?? null : now,
    registered_at: prev?.registered_at || now,
    hidden: prev?.hidden ? 1 : 0,
  };
}

// ── 화면으로 보낼 값 ──────────────────────────────────────────

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
export const CATEGORIES = ['생활', '건강', '돈', '모임', '업무', '기타'];
export const STATUSES = ['운영중', '개발중', '중단'];

function parse(text) {
  if (!text) return null;
  try { const j = JSON.parse(text); return j && typeof j === 'object' && !Array.isArray(j) ? j : null; } catch { return null; }
}

// 저장된 행 → 화면용 값. 원문에서 필요한 것만 글자·숫자로 꺼낸다(나머지는 버린다).
// 그림 주소는 등록된 주소 + /og.png로만 만든다(app.json에 적힌 주소는 쓰지 않는다).
export function toView(row) {
  const m = parse(row.meta), h = parse(row.health);
  const category = CATEGORIES.includes(m?.category) ? m.category : (m ? '기타' : '');
  const status = STATUSES.includes(m?.status) ? m.status : '';
  const u = h?.usage;
  const usage = u && typeof u === 'object' && Number.isFinite(Number(u.last30d))
    ? { last30d: Math.max(0, Math.floor(Number(u.last30d))), lastUsedAt: str(u.lastUsedAt, 40) || null }
    : null;
  return {
    url: row.url,
    image: row.url + '/og.png',
    hasMeta: !!m,
    name: str(m?.name, 60),
    emoji: str(m?.emoji, 16),
    summary: str(m?.summary, 200),
    category, status,
    public: m ? m.public !== false : true,
    usage,
    state: ['ok', 'down', 'legacy'].includes(row.state) ? row.state : 'down',
    failCount: Number(row.fail_count) || 0,
    checkedAt: row.checked_at || null,
    okAt: row.ok_at || null,
    registeredAt: row.registered_at || null,
    hidden: !!row.hidden,
  };
}
