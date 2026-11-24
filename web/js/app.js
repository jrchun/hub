// 앱 허브 화면: 그리기와 이벤트만 맡는다. 규칙(정렬·배지·링크)은 view.js의 순수 함수에 있다.
// 앱에서 받은 글자(이름·설명 등)는 textContent로만 넣는다(innerHTML을 쓰지 않는다 = 자동으로 안전 처리).
import * as api from './api.js';
import { CATEGORIES, sortApps, filterApps, summarize, displayName, usageText, badges, linkFor, tileInfo } from './view.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let apps = [], canEdit = false, category = '전체', firstTime = false;
// 다른 앱에서 "허브에서 로그인"으로 넘어왔을 때(?login=1&return=<앱 주소>): 로그인 칸을 바로 열고, 로그인 뒤 그 앱으로 돌아간다.
const params = new URLSearchParams(location.search);
const returnTo = params.get('return') || '';
const wantLogin = params.get('login') === '1';
// 보기 방식: 'grid'(3×3 격자) | 'list'(큰 카드). 이 기기에 기억한다.
let viewMode = (() => { try { return localStorage.getItem('hub-view') || 'grid'; } catch { return 'grid'; } })();
const status = text => { $('status').textContent = text; };

function renderChips() {
  const box = $('chips'); box.replaceChildren();
  for (const c of CATEGORIES) {
    const b = el('button', 'chip', c);
    b.type = 'button';
    b.setAttribute('aria-pressed', String(c === category));
    b.addEventListener('click', () => { category = c; renderChips(); renderList(); });
    box.append(b);
  }
}

function renderSummary() {
  const s = summarize(apps);
  $('summary').textContent = `내 앱 ${s.total}개 · 정상 ${s.ok} · 응답 없음 ${s.down}`;
}

function shot(app) {
  const box = el('div', 'shot');
  const emoji = el('span', 'shot-emoji', app.emoji || '🧩');
  emoji.setAttribute('aria-hidden', 'true');
  const img = new Image();
  img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  img.addEventListener('load', () => { box.classList.add('has-img'); });
  img.addEventListener('error', () => { img.remove(); });
  img.src = app.image; // 등록된 주소 + /og.png (서버가 만든 값. app.json의 주소는 쓰지 않는다)
  box.append(emoji, img);
  return box;
}

function card(app) {
  const art = el('article', 'card' + (app.hidden ? ' is-hidden' : ''));
  const href = linkFor(app);
  const main = el(href ? 'a' : 'div', 'card-main');
  if (href) { main.href = href; main.target = '_blank'; main.rel = 'noopener noreferrer'; }

  const body = el('div', 'card-body');
  const title = el('h2', 'card-title');
  if (app.emoji) title.append(el('span', 'card-emoji', app.emoji));
  title.append(el('span', 'card-name', displayName(app)));
  body.append(title);
  body.append(el('p', 'card-summary', app.summary || (app.hasMeta ? '' : app.url.replace(/^https:\/\//, ''))));

  const tags = el('div', 'tags');
  if (app.status) tags.append(el('span', 'pill pill-status s-' + ({ 운영중: 'live', 개발중: 'dev', 중단: 'stop' }[app.status]), app.status));
  if (app.category) tags.append(el('span', 'pill', app.category));
  for (const b of badges(app)) tags.append(el('span', 'pill tone-' + b.tone, b.text));
  if (tags.childElementCount) body.append(tags);
  body.append(el('p', 'card-usage num', usageText(app)));
  if (!href) body.append(el('p', 'card-note', '링크 숨김(공개 안 함)'));

  main.append(shot(app), body);
  art.append(main);

  if (canEdit) {
    const acts = el('div', 'card-actions');
    const hide = el('button', '', app.hidden ? '보이기' : '숨기기'); hide.type = 'button';
    hide.addEventListener('click', async () => {
      hide.disabled = true;
      const r = await api.setHidden(app.url, !app.hidden).catch(() => ({ ok: false }));
      if (!r.ok) { status(r.status === 401 ? '편집 암호가 맞지 않습니다.' : '바꾸지 못했습니다.'); hide.disabled = false; return; }
      app.hidden = !app.hidden; status(app.hidden ? `${displayName(app)}: 숨겼습니다(편집 암호가 없는 사람에게 안 보임)` : `${displayName(app)}: 다시 보입니다`);
      renderList();
    });
    // 삭제는 한 번 더 확인한다: 처음 누르면 "정말 삭제"로 바뀌고, 4초 안에 다시 눌러야 지운다.
    const del = el('button', 'danger', '삭제'); del.type = 'button';
    let armed = null;
    del.addEventListener('click', async () => {
      if (!armed) {
        del.textContent = '정말 삭제할까요? 한 번 더 누르기'; del.classList.add('armed');
        armed = setTimeout(() => { armed = null; del.textContent = '삭제'; del.classList.remove('armed'); }, 4000);
        return;
      }
      clearTimeout(armed); armed = null; del.disabled = true;
      const r = await api.removeApp(app.url).catch(() => ({ ok: false }));
      if (!r.ok) { status('삭제하지 못했습니다.'); del.disabled = false; return; }
      apps = apps.filter(a => a.url !== app.url);
      status(`${displayName(app)}: 삭제했습니다. 앱이 다시 배포되면 스스로 다시 등록됩니다.`);
      renderSummary(); renderList();
    });
    acts.append(hide, del);
    art.append(acts);
  }
  return art;
}

// 격자 칸: 대표 화면(정사각형) + 이름 한 줄 + 상태 한 줄. 자세한 설명·버튼은 목록 보기에서.
function tile(app) {
  const href = linkFor(app);
  const t = el(href ? 'a' : 'div', 'tile' + (app.hidden ? ' is-hidden' : ''));
  if (href) { t.href = href; t.target = '_blank'; t.rel = 'noopener noreferrer'; }
  const { tone, sub } = tileInfo(app);
  const s = shot(app); s.classList.add('tile-shot');
  const dot = el('span', 'tile-dot dot-' + tone); dot.setAttribute('aria-hidden', 'true');
  s.append(dot);
  t.append(s, el('span', 'tile-name', displayName(app)), el('span', 'tile-sub tone-text-' + tone, sub));
  t.title = [displayName(app), app.summary, usageText(app)].filter(Boolean).join('\n');
  return t;
}

function renderList() {
  const list = $('list'); list.replaceChildren();
  const shown = sortApps(filterApps(apps, category));
  if (!shown.length) {
    list.append(el('p', 'empty', apps.length ? `'${category}' 분류의 앱이 없습니다.` : '아직 등록된 앱이 없습니다. 앱이 배포되면 스스로 등록됩니다.'));
    return;
  }
  list.classList.toggle('grid3', viewMode === 'grid');
  for (const a of shown) list.append(viewMode === 'grid' ? tile(a) : card(a));
}

function renderEdit() {
  $('editBar').hidden = !canEdit;
  $('editBtn').textContent = canEdit ? '잠그기' : '편집';
}

async function load() {
  try {
    const r = await api.getApps();
    apps = r.apps || []; canEdit = !!r.canEdit;
    renderSummary(); renderEdit(); renderList();
    return r;
  } catch (e) {
    status('서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.');
    return null;
  }
}

$('editBtn').addEventListener('click', async () => {
  if (canEdit) { // 잠그기 = 로그아웃(이 브라우저에서. 다른 앱도 같이 잠긴다)
    await api.logout(); canEdit = false; $('tokenForm').hidden = true;
    status('로그아웃했습니다. 다른 앱도 이 브라우저에서는 같이 잠깁니다.'); await load(); return;
  }
  await openLogin();
});

$('logoutAll').addEventListener('click', async () => {
  await api.logout(true); canEdit = false;
  status('모든 기기·브라우저에서 로그아웃했습니다.'); await load();
});

async function openLogin(force) {
  const s = await api.getStatus().catch(() => ({}));
  firstTime = s.passwordSet === false;
  const min = s.passwordMinLength || 6;
  $('tokenLabel').textContent = firstTime ? `편집 암호 정하기(${min}자 이상)` : '편집 암호';
  $('tokenIn').autocomplete = firstTime ? 'new-password' : 'current-password';
  $('tokenIn').minLength = firstTime ? min : 0;
  status(firstTime ? '아직 편집 암호가 없습니다. 앞으로 쓸 편집 암호를 정해 주세요. 다른 기기에서도 이 암호로 고칩니다.' : '');
  if (!firstTime && returnTo) status('허브에 로그인하면 원래 앱으로 돌아가 바로 저장할 수 있습니다. 이 브라우저에서는 다른 앱도 다시 묻지 않습니다.');
  $('tokenForm').hidden = force ? false : !$('tokenForm').hidden;
  if (!$('tokenForm').hidden) $('tokenIn').focus();
}

$('tokenForm').addEventListener('submit', async e => {
  e.preventDefault();
  const t = $('tokenIn').value.trim(); $('tokenIn').value = '';
  if (firstTime) {
    const r = await api.claimPassword(t).catch(() => ({ ok: false, detail: '서버에 연결하지 못했습니다.' }));
    if (!r.ok && !r.taken) { status(r.detail); return; }
    if (r.taken) { firstTime = false; $('tokenLabel').textContent = '편집 암호'; status('편집 암호가 이미 정해져 있습니다. 그 암호를 입력해 주세요.'); return; }
  }
  const r = await api.login(t, returnTo).catch(() => ({ ok: false, detail: '서버에 연결하지 못했습니다.' }));
  if (!r.ok) { status(r.status === 401 ? '편집 암호가 맞지 않습니다. 다시 입력해 주세요.' : r.detail); return; }
  if (r.next) { status('로그인했습니다. 원래 앱으로 돌아갑니다…'); location.href = r.next; return; }
  await load();
  $('tokenForm').hidden = true;
  status(firstTime ? '편집 암호를 정하고 로그인했습니다. woongstudio.com의 다른 앱에서도 바로 편집할 수 있습니다.' : '로그인했습니다. woongstudio.com의 다른 앱에서도 바로 편집할 수 있습니다.');
  firstTime = false;
});

$('refreshBtn').addEventListener('click', async () => {
  const b = $('refreshBtn'); b.disabled = true; status('앱들을 확인하는 중… (앱마다 최대 10초)');
  const r = await api.refreshAll().catch(() => ({ ok: false }));
  b.disabled = false;
  if (!r.ok) { status(r.status === 401 ? '편집 암호가 맞지 않습니다.' : '확인하지 못했습니다. 잠시 후 다시 눌러 주세요.'); return; }
  const d = r.data;
  status(`${d.checked}개 확인: 정상 ${d.ok}, 응답 없음 ${d.down}, 허브 준비 전 ${d.legacy}` + (d.total > d.checked ? ` (나머지 ${d.total - d.checked}개는 다음에)` : ''));
  await load();
});

function renderView() {
  $('viewGrid').setAttribute('aria-pressed', String(viewMode === 'grid'));
  $('viewList').setAttribute('aria-pressed', String(viewMode === 'list'));
}
for (const [id, mode] of [['viewGrid', 'grid'], ['viewList', 'list']]) {
  $(id).addEventListener('click', () => {
    viewMode = mode; try { localStorage.setItem('hub-view', mode); } catch { /* 기억 못 해도 이번 화면에서는 바뀐다 */ }
    renderView(); renderList();
  });
}

renderChips();
renderView();
load().then(r => { if (wantLogin && r && !r.canEdit) openLogin(true); else if (wantLogin && r && r.canEdit && returnTo) status('이미 로그인돼 있습니다. 원래 앱으로 돌아가 저장하면 됩니다.'); });
