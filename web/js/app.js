// 앱 허브 화면: 그리기와 이벤트만 맡는다. 규칙(정렬·배지·링크)은 view.js의 순수 함수에 있다.
// 앱에서 받은 글자(이름·설명 등)는 textContent로만 넣는다(innerHTML을 쓰지 않는다 = 자동으로 안전 처리).
import * as api from './api.js';
import { chipList, sortApps, filterApps, summarize, displayName, usageText, badges, linkFor, tileInfo, chipKeyTarget, pushToast, toastTimeout } from './view.js';

const $ = id => document.getElementById(id);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let apps = [], canEdit = false, category = '전체', firstTime = false;
// 다른 앱에서 "허브에서 로그인"으로 넘어왔을 때(?login=1&return=<앱 주소>): 로그인 칸을 바로 열고, 로그인 뒤 그 앱으로 돌아간다.
const params = new URLSearchParams(location.search);
const returnTo = params.get('return') || '';
const wantLogin = params.get('login') === '1';
const loginMsg = text => { $('loginMsg').textContent = text; };

// ── 떠 있는 알림 ── kind: info(5초 뒤 사라짐) | error(✕로 닫을 때까지) | busy(다음 알림이 오면 사라짐). 목록 규칙은 view.js pushToast.
let toasts = [], toastSeq = 0;
function status(text, kind = 'info') {
  if (!text) return;
  const item = { id: ++toastSeq, text, kind };
  toasts = pushToast(toasts, item);
  drawToasts();
  const ms = toastTimeout(kind);
  if (ms) setTimeout(() => dropToast(item.id), ms);
}
function dropToast(id) { toasts = toasts.filter(t => t.id !== id); drawToasts(); }
function drawToasts() {
  const box = $('toasts');
  const keep = new Set(toasts.map(t => t.id));
  for (const n of box.children) {
    if (keep.has(Number(n.dataset.id)) || n.hasAttribute('data-ending-style')) continue;
    n.setAttribute('data-ending-style', ''); // 퇴장 움직임(styles.css) 뒤에 지운다
    setTimeout(() => n.remove(), 220);
  }
  for (const t of toasts) if (!box.querySelector(`[data-id="${t.id}"]`)) box.append(toastEl(t));
  placeToasts();
}
function toastEl(t) {
  const n = el('div', 'toast');
  n.dataset.id = String(t.id); n.dataset.kind = t.kind;
  if (t.kind === 'error') n.setAttribute('role', 'alert');
  n.append(el('span', 'toast-text', t.text));
  if (t.kind === 'error') {
    const x = el('button', 'toast-x', '✕'); x.type = 'button'; x.setAttribute('aria-label', '알림 닫기');
    x.addEventListener('click', () => dropToast(t.id));
    n.append(x);
  }
  return n;
}
// 창(showModal)이 열려 있으면 창 바깥은 전부 누를 수 없게 된다(inert). 그래서 알림 상자를 열린 창 안으로 옮겨
// 창 위에 보이고 ✕도 눌리게 한다. 창이 닫히면 페이지로 돌려놓는다.
function placeToasts() {
  const box = $('toasts');
  const host = document.querySelector('dialog[open]') || document.body;
  if (box.parentNode !== host) host.append(box);
}

// 분류 칩 = 라디오 묶음. 고른 칩만 Tab 자리(tabindex 0)이고, 화살표·Home·End로 옮기면 바로 고른다(view.js chipKeyTarget).
function renderChips(focus = false) {
  const box = $('chips'); box.replaceChildren();
  const list = chipList(apps);
  if (!list.includes(category)) category = '전체'; // 고른 분류의 앱이 없어졌으면 전체로
  box.hidden = !list.length;
  for (const c of list) {
    const on = c === category;
    const b = el('button', 'chip', c);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(on));
    b.tabIndex = on ? 0 : -1;
    b.addEventListener('click', () => pickCategory(c));
    b.addEventListener('keydown', e => {
      const i = chipKeyTarget(e.key, list.indexOf(category), list.length, getComputedStyle(box).direction);
      if (i === null) return;
      e.preventDefault();
      pickCategory(list[i], true);
    });
    box.append(b);
  }
  if (focus) box.querySelector('[aria-checked="true"]')?.focus();
}
function pickCategory(c, focus = false) { category = c; renderChips(focus); renderList(); }

function renderSummary() {
  const s = summarize(apps);
  // 방문자에게는 안 보인다(상태는 주인만 본다)
  $('summary').hidden = !canEdit;
  $('summary').textContent = canEdit ? `내 앱 ${s.total}개 · 정상 ${s.ok} · 응답 없음 ${s.down}` : '';
}

function shot(app) {
  const box = el('div', 'shot');
  // 그림이 없을 때 대신 보여 줄 이름 첫 글자(이모지는 쓰지 않는다)
  const emoji = el('span', 'shot-emoji', displayName(app).slice(0, 1));
  emoji.setAttribute('aria-hidden', 'true');
  const img = new Image();
  img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
  img.addEventListener('load', () => { box.classList.add('has-img'); });
  img.addEventListener('error', () => { img.remove(); });
  img.src = app.image; // 등록된 주소 + /og.png (서버가 만든 값. app.json의 주소는 쓰지 않는다)
  box.append(emoji, img);
  return box;
}

// 앱 설명 창의 내용: 대표 그림, 이름, 한 줄 설명, 상태, [열기 →]. 주인에게는 사용량·응답 상태·숨기기/삭제도.
function detail(app) {
  const art = el('article', 'card detail' + (app.hidden ? ' is-hidden' : ''));
  const href = linkFor(app);
  const s = shot(app); s.classList.add('detail-shot');
  const body = el('div', 'card-body');
  const title = el('h2', 'card-title');
  title.id = 'appTitle';
  title.append(el('span', 'card-name', displayName(app)));
  body.append(title);
  const desc = el('p', 'card-summary', app.summary || (app.hasMeta ? '' : app.url.replace(/^https:\/\//, '')));
  desc.id = 'appDesc';
  body.append(desc);

  const tags = el('div', 'tags');
  if (app.status) tags.append(el('span', 'pill pill-status s-' + ({ 운영중: 'live', 개발중: 'dev', 중단: 'stop' }[app.status]), app.status));
  if (canEdit) for (const b of badges(app)) tags.append(el('span', 'pill tone-' + b.tone, b.text));
  if (tags.childElementCount) body.append(tags);
  if (canEdit) body.append(el('p', 'card-usage', usageText(app)));

  const go = el('div', 'detail-go');
  if (href) {
    const a = el('a', 'primary go-link', '열기 →');
    a.href = href; a.target = '_blank'; a.rel = 'noopener noreferrer';
    go.append(a);
  } else {
    go.append(el('p', 'card-note', '링크 숨김(공개 안 함)'));
  }
  body.append(go);
  art.append(s, body);

  if (canEdit) {
    const acts = el('div', 'card-actions');
    const hide = el('button', '', app.hidden ? '보이기' : '숨기기'); hide.type = 'button';
    hide.addEventListener('click', async () => {
      hide.disabled = true;
      const r = await api.setHidden(app.url, !app.hidden).catch(() => ({ ok: false }));
      if (!r.ok) { status(r.status === 401 ? '편집 암호가 맞지 않습니다.' : '바꾸지 못했습니다.', 'error'); hide.disabled = false; return; }
      app.hidden = !app.hidden; status(app.hidden ? `${displayName(app)}: 숨겼습니다(로그인하지 않은 사람에게 안 보임)` : `${displayName(app)}: 다시 보입니다`);
      renderList(); openDetail(app);
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
      if (!r.ok) { status('삭제하지 못했습니다.', 'error'); del.disabled = false; return; }
      apps = apps.filter(a => a.url !== app.url);
      $('appDlg').close();
      status(`${displayName(app)}: 삭제했습니다. 앱이 다시 배포되면 스스로 다시 등록됩니다.`);
      renderSummary(); renderChips(); renderList();
    });
    acts.append(hide, del);
    art.append(acts);
  }
  return art;
}

function openDetail(app) {
  $('appBody').replaceChildren(detail(app));
  // 화면 읽기 프로그램이 제목 다음에 한 줄 설명도 읽게(설명이 없으면 연결하지 않는다)
  if ($('appDesc').textContent) $('appDlg').setAttribute('aria-describedby', 'appDesc'); else $('appDlg').removeAttribute('aria-describedby');
  if (!$('appDlg').open) { $('appDlg').showModal(); placeToasts(); }
}

// 격자 칸: 대표 화면(정사각형) + 이름(+ 주인에게만 상태 한 줄). 누르면 바로 넘어가지 않고 설명 창이 뜬다.
function tile(app) {
  const { tone, sub } = tileInfo(app);
  // t-<상태>: 응답 없음이면 칸 아래에 줄무늬 테이프를 그린다(styles.css). 방문자는 t-none.
  const t = el('button', 'tile t-' + tone + (app.hidden ? ' is-hidden' : ''));
  t.type = 'button';
  t.setAttribute('aria-haspopup', 'dialog');
  const s = shot(app); s.classList.add('tile-shot');
  if (tone !== 'none') { const dot = el('span', 'tile-dot dot-' + tone); dot.setAttribute('aria-hidden', 'true'); s.append(dot); }
  t.append(s, el('span', 'tile-name', displayName(app)));
  if (sub) t.append(el('span', 'tile-sub tone-text-' + tone, sub)); // 주인에게만(상태·사용량)
  t.addEventListener('click', () => openDetail(app));
  return t;
}

function renderList() {
  const list = $('list'); list.replaceChildren();
  const shown = sortApps(filterApps(apps, category));
  if (!shown.length) {
    list.append(el('p', 'empty', apps.length ? `'${category}' 분류의 앱이 없습니다.` : '아직 등록된 앱이 없습니다. 앱이 배포되면 스스로 등록됩니다.'));
    return;
  }
  for (const a of shown) list.append(tile(a));
}

// 방문자: 카드만 보이고 관리 버튼은 없다. 주인은 제목 "웅 스튜디오"를 눌러 로그인한다(다른 앱에서 넘어오면 바로 로그인 창).
function renderEdit() {
  $('editBar').hidden = !canEdit;
  $('editBtn').hidden = !canEdit;
  $('editBtn').textContent = '잠그기';
}

async function load() {
  try {
    const r = await api.getApps();
    apps = r.apps || []; canEdit = !!r.canEdit;
    renderSummary(); renderEdit(); renderChips(); renderList();
    return r;
  } catch (e) {
    status('서버에 연결하지 못했습니다. 잠시 후 새로고침해 주세요.', 'error');
    return null;
  }
}

$('editBtn').addEventListener('click', async () => {
  if (canEdit) { // 잠그기 = 로그아웃(이 브라우저에서. 다른 앱도 같이 잠긴다)
    await api.logout(); canEdit = false;
    status('로그아웃했습니다. 다른 앱도 이 브라우저에서는 같이 잠깁니다.'); await load(); return;
  }
  await openLogin();
});

// 제목을 누르면 로그인 창. 이미 로그인했으면 아무 일도 없다(관리 버튼이 이미 보인다).
$('titleBtn').addEventListener('click', () => { if (!canEdit) openLogin(); });
$('loginCancel').addEventListener('click', () => $('loginDlg').close());

$('logoutAll').addEventListener('click', async () => {
  await api.logout(true); canEdit = false;
  status('모든 기기·브라우저에서 로그아웃했습니다.'); await load();
});

async function openLogin() {
  const s = await api.getStatus().catch(() => ({}));
  firstTime = s.passwordSet === false;
  const min = s.passwordMinLength || 6;
  $('tokenLabel').textContent = firstTime ? `편집 암호 정하기(${min}자 이상)` : '편집 암호';
  $('tokenIn').autocomplete = firstTime ? 'new-password' : 'current-password';
  $('tokenIn').minLength = firstTime ? min : 0;
  $('tokenIn').value = '';
  loginMsg(firstTime ? '아직 편집 암호가 없습니다. 앞으로 쓸 편집 암호를 정해 주세요. 다른 기기에서도 이 암호로 고칩니다.'
    : returnTo ? '로그인하면 원래 앱으로 돌아가 바로 저장할 수 있습니다. 이 브라우저에서는 다른 앱도 다시 묻지 않습니다.' : '');
  if (!$('loginDlg').open) { $('loginDlg').showModal(); placeToasts(); }
  $('tokenIn').focus();
}

$('tokenForm').addEventListener('submit', async e => {
  e.preventDefault();
  const t = $('tokenIn').value.trim(); $('tokenIn').value = '';
  if (firstTime) {
    const r = await api.claimPassword(t).catch(() => ({ ok: false, detail: '서버에 연결하지 못했습니다.' }));
    if (!r.ok && !r.taken) { loginMsg(r.detail); return; }
    if (r.taken) { firstTime = false; $('tokenLabel').textContent = '편집 암호'; loginMsg('편집 암호가 이미 정해져 있습니다. 그 암호를 입력해 주세요.'); return; }
  }
  const r = await api.login(t, returnTo).catch(() => ({ ok: false, detail: '서버에 연결하지 못했습니다.' }));
  if (!r.ok) { loginMsg(r.status === 401 ? '편집 암호가 맞지 않습니다. 다시 입력해 주세요.' : r.detail); $('tokenIn').focus(); return; }
  if (r.next) { loginMsg('로그인했습니다. 원래 앱으로 돌아갑니다…'); location.href = r.next; return; }
  $('loginDlg').close();
  await load();
  status(firstTime ? '편집 암호를 정하고 로그인했습니다. woongstudio.com의 다른 앱에서도 바로 편집할 수 있습니다.' : '로그인했습니다. woongstudio.com의 다른 앱에서도 바로 편집할 수 있습니다.');
  firstTime = false;
});

$('refreshBtn').addEventListener('click', async () => {
  const b = $('refreshBtn'); b.disabled = true; status('앱들을 확인하는 중… (앱마다 최대 10초)', 'busy');
  const r = await api.refreshAll().catch(() => ({ ok: false }));
  b.disabled = false;
  if (!r.ok) { status(r.status === 401 ? '편집 암호가 맞지 않습니다.' : '확인하지 못했습니다. 잠시 후 다시 눌러 주세요.', 'error'); return; }
  const d = r.data;
  status(`${d.checked}개 확인: 정상 ${d.ok}, 응답 없음 ${d.down}, 허브 준비 전 ${d.legacy}` + (d.total > d.checked ? ` (나머지 ${d.total - d.checked}개는 다음에)` : ''));
  await load();
});

// 앱 설명 창: ✕·바깥(어두운 곳) 누르기·Esc로 닫는다.
$('appClose').addEventListener('click', () => $('appDlg').close());
$('appDlg').addEventListener('click', e => { if (e.target === $('appDlg')) $('appDlg').close(); });

renderChips();
for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', placeToasts);
// 예전 방식(이 기기에 암호를 기억)으로 편집하던 브라우저는 한 번 허브 로그인으로 바꿔 준다(쿠키가 생겨야 다른 앱도 편집된다).
async function upgradeLegacy() {
  const legacy = api.getToken();
  if (!legacy) return;
  const r = await api.login(legacy).catch(() => ({ ok: false }));
  api.rememberToken('');
  if (r.ok) status('허브 로그인으로 바꿨습니다. 이 브라우저에서는 woongstudio.com의 다른 앱도 바로 편집할 수 있습니다.');
}
upgradeLegacy().then(load).then(r => { if (wantLogin && r && !r.canEdit) openLogin(); else if (wantLogin && r && r.canEdit && returnTo) status('이미 로그인돼 있습니다. 원래 앱으로 돌아가 저장하면 됩니다.'); });
