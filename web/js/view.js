// 화면 규칙(순수 함수, DOM 없음). tests/view.test.js에서 확인한다.
// 정렬, 요약 숫자, 배지, "n일 전" 글자, 링크를 보여 줄지.

export const STATUS_ORDER = { 운영중: 0, 개발중: 1, 중단: 2 };
export const CATEGORIES = ['전체', '생활', '건강', '돈', '모임', '업무', '기타'];
const DAY = 86400000;

const time = iso => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? t : null; };

// 정렬: 운영중 → 개발중 → 중단 → (상태 모름) 순. 같은 상태끼리는 최근 사용 순(기록 없는 앱은 뒤), 그다음 이름.
export function sortApps(apps) {
  return [...apps].sort((a, b) => {
    const s = (STATUS_ORDER[a.status] ?? 3) - (STATUS_ORDER[b.status] ?? 3);
    if (s) return s;
    const ta = time(a.usage?.lastUsedAt) ?? -Infinity, tb = time(b.usage?.lastUsedAt) ?? -Infinity;
    if (ta !== tb) return tb - ta;
    return displayName(a).localeCompare(displayName(b), 'ko');
  });
}

// 보여 줄 분류 칩: '전체' + 앱이 있는 분류만(정해진 순서대로). 분류가 하나뿐이면 칩이 필요 없다(빈 배열).
export function chipList(apps) {
  const used = new Set(apps.map(a => a.category).filter(Boolean));
  const list = CATEGORIES.filter(c => c !== '전체' && used.has(c));
  return list.length >= 2 ? ['전체', ...list] : [];
}

// 분류 필터. '전체'면 그대로.
export const filterApps = (apps, category) => (!category || category === '전체' ? apps : apps.filter(a => a.category === category));

// 맨 위 요약 숫자
export function summarize(apps) {
  return {
    total: apps.length,
    ok: apps.filter(a => a.state === 'ok').length,
    down: apps.filter(a => a.state === 'down').length,
  };
}

// 이름이 없으면(허브 준비 전 앱) 주소 맨 앞부분을 쓴다.
export function displayName(app) {
  return app.name || String(app.url || '').replace(/^https:\/\//, '').split('.')[0] || '이름 없음';
}

// 며칠 전인가(오늘 = 0). 시각이 없으면 null.
export function daysSince(iso, now = Date.now()) {
  const t = time(iso);
  return t === null ? null : Math.max(0, Math.floor((now - t) / DAY));
}

export function agoText(iso, now = Date.now()) {
  const d = daysSince(iso, now);
  return d === null ? '' : d === 0 ? '오늘' : `${d}일 전`;
}

// "최근 30일 n회 · 마지막 사용 n일 전"
export function usageText(app, now = Date.now()) {
  const u = app.usage;
  if (!u) return '사용 기록 없음';
  const last = agoText(u.lastUsedAt, now);
  return `최근 30일 ${u.last30d}회` + (last ? ` · 마지막 사용 ${last}` : '');
}

// 배지 목록 [{text, tone}] tone: bad | warn | muted
export function badges(app, now = Date.now()) {
  const out = [];
  if (app.state === 'down') {
    // 마지막으로 응답한 날(없으면 등록한 날)부터 며칠째인지. 오늘 멈췄으면 1일째.
    const d = daysSince(app.okAt || app.registeredAt, now);
    out.push({ text: `응답 없음 (${(d ?? 0) + 1}일째)`, tone: 'bad' });
  }
  if (app.state === 'legacy') out.push({ text: '허브 준비 전', tone: 'warn' });
  if (app.usage && app.usage.last30d === 0) out.push({ text: '쉬는 중', tone: 'muted' });
  if (app.hidden) out.push({ text: '숨김', tone: 'muted' });
  return out;
}

// 카드를 눌렀을 때 열 주소. public: false면 링크를 숨긴다(null). 주소는 https만.
export function linkFor(app) {
  if (app.public === false) return null;
  return /^https:\/\/[a-z0-9.-]+$/.test(app.url || '') ? app.url : null;
}

// 격자 칸에 쓸 값: 상태 점 색(tone)과 이름 아래 한 줄(sub). 문제가 있으면 그것을, 없으면 사용량을 보여 준다.
//   tone: ok(정상) | bad(응답 없음) | warn(허브 준비 전) | muted(쉬는 중) | none(방문자: 상태를 받지 않아 점을 그리지 않음)
export function tileInfo(app, now = Date.now()) {
  if (!app.state) return { tone: 'none', sub: '' }; // 방문자에게는 상태·사용량을 보내지 않는다(publicView). 분류는 칩으로 구분한다
  const bs = badges(app, now).filter(b => b.text !== '숨김');
  const tone = app.state === 'down' ? 'bad' : app.state === 'legacy' ? 'warn' : bs.some(b => b.text === '쉬는 중') ? 'muted' : 'ok';
  const sub = bs.length ? bs[0].text.replace(/ \((\d+)일째\)$/, ' $1일') : app.usage ? `30일 ${app.usage.last30d}회` : '';
  return { tone, sub };
}

// 분류 칩 키보드 이동(WAI-ARIA 라디오 묶음, docs/UI_PATTERNS.md 5장).
// ←↑ 이전, →↓ 다음(끝에서 처음으로 돈다), Home/PageUp 처음, End/PageDown 끝. 오른쪽→왼쪽 언어(dir='rtl')는 좌우를 뒤집는다.
// 이동할 칸 번호를 돌려주고, 상관없는 키면 null.
export function chipKeyTarget(key, current, count, dir = 'ltr') {
  if (count <= 0) return null;
  if (dir === 'rtl' && (key === 'ArrowLeft' || key === 'ArrowRight')) key = key === 'ArrowLeft' ? 'ArrowRight' : 'ArrowLeft';
  const at = Math.min(Math.max(current, 0), count - 1);
  switch (key) {
    case 'ArrowLeft': case 'ArrowUp': return (at - 1 + count) % count;
    case 'ArrowRight': case 'ArrowDown': return (at + 1) % count;
    case 'Home': case 'PageUp': return 0;
    case 'End': case 'PageDown': return count - 1;
    default: return null;
  }
}

// 떠 있는 알림(docs/UI_PATTERNS.md 5장 Toast). kind: info(5초 뒤 사라짐) | error(직접 닫을 때까지) | busy(다음 알림이 오면 사라짐)
export const TOAST_LIMIT = 3;
export const TOAST_TIMEOUT = 5000;
// 새 알림을 넣은 목록: 진행 중(busy) 알림은 빼고, 같은 글이 이미 있으면 빼고 맨 뒤에 다시, 넘치면 오래된 것부터 버린다.
export function pushToast(list, item, limit = TOAST_LIMIT) {
  const kept = list.filter(t => t.kind !== 'busy' && t.text !== item.text);
  return [...kept, item].slice(-limit);
}
// 알림이 저절로 사라질 때까지의 시간(ms). 안 사라지면 0.
export const toastTimeout = kind => (kind === 'info' ? TOAST_TIMEOUT : 0);
