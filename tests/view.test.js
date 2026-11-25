// 화면 규칙(web/js/view.js, DOM 없음). 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chipList, sortApps, filterApps, summarize, displayName, usageText, badges, linkFor, agoText, tileInfo, chipKeyTarget, pushToast, toastTimeout } from '../web/js/view.js';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const day = n => new Date(NOW - n * 86400000).toISOString();
const app = (o = {}) => ({ url: 'https://a.t.workers.dev', name: 'A', status: '운영중', category: '생활', state: 'ok', usage: { last30d: 3, lastUsedAt: day(1) }, ...o });

test('정렬: 운영중 → 개발중 → 중단 → 상태 모름, 같은 상태는 최근 사용 순', () => {
  const list = [
    app({ name: '중단', status: '중단' }),
    app({ name: '개발', status: '개발중' }),
    app({ name: '운영-오래', usage: { last30d: 1, lastUsedAt: day(20) } }),
    app({ name: '예전앱', status: '', usage: null }),
    app({ name: '운영-최근', usage: { last30d: 9, lastUsedAt: day(0) } }),
    app({ name: '운영-기록없음', usage: null }),
  ];
  assert.deepEqual(sortApps(list).map(a => a.name), ['운영-최근', '운영-오래', '운영-기록없음', '개발', '중단', '예전앱']);
});

test('분류 필터와 요약 숫자', () => {
  const list = [app({ category: '돈' }), app({ category: '건강', state: 'down' }), app({ state: 'legacy', category: '' })];
  assert.equal(filterApps(list, '전체').length, 3);
  assert.equal(filterApps(list, '돈').length, 1);
  assert.deepEqual(summarize(list), { total: 3, ok: 1, down: 1 });
});

test('이름 없으면 주소 앞부분', () => {
  assert.equal(displayName({ url: 'https://rebalance.tedcheon.workers.dev', name: '' }), 'rebalance');
});

test('사용량 글자', () => {
  assert.equal(usageText(app(), NOW), '최근 30일 3회 · 마지막 사용 1일 전');
  assert.equal(usageText(app({ usage: { last30d: 2, lastUsedAt: day(0.2) } }), NOW), '최근 30일 2회 · 마지막 사용 오늘');
  assert.equal(usageText(app({ usage: { last30d: 0, lastUsedAt: null } }), NOW), '최근 30일 0회');
  assert.equal(usageText(app({ usage: null }), NOW), '사용 기록 없음');
  assert.equal(agoText('bad'), '');
});

test('배지: 쉬는 중 / 응답 없음 (n일째) / 허브 준비 전', () => {
  assert.deepEqual(badges(app({ usage: { last30d: 0, lastUsedAt: day(40) } }), NOW), [{ text: '쉬는 중', tone: 'muted' }]);
  assert.deepEqual(badges(app({ state: 'down', okAt: day(2.5), usage: null }), NOW), [{ text: '응답 없음 (3일째)', tone: 'bad' }]);
  assert.deepEqual(badges(app({ state: 'down', okAt: null, registeredAt: day(0.1), usage: null }), NOW), [{ text: '응답 없음 (1일째)', tone: 'bad' }]);
  assert.deepEqual(badges(app({ state: 'legacy', usage: null }), NOW), [{ text: '허브 준비 전', tone: 'warn' }]);
  assert.deepEqual(badges(app(), NOW), []);
});

test('public: false면 링크를 숨긴다, https 주소만 링크', () => {
  assert.equal(linkFor(app({ public: true })), 'https://a.t.workers.dev');
  assert.equal(linkFor(app({ public: false })), null);
  assert.equal(linkFor(app({ public: undefined })), 'https://a.t.workers.dev'); // 예전 앱(app.json 없음)
  assert.equal(linkFor(app({ url: 'javascript:alert(1)' })), null);
});

test('격자 칸: 문제가 있으면 그것을, 없으면 사용량을 한 줄로', () => {
  assert.deepEqual(tileInfo(app(), NOW), { tone: 'ok', sub: '30일 3회' });
  assert.deepEqual(tileInfo({ name: 'x', category: '돈' }, NOW), { tone: 'none', sub: '' }); // 방문자(상태를 받지 않음), 분류는 칩으로
  assert.deepEqual(tileInfo(app({ state: 'down', okAt: day(2.5), usage: null }), NOW), { tone: 'bad', sub: '응답 없음 3일' });
  assert.deepEqual(tileInfo(app({ state: 'legacy', usage: null }), NOW), { tone: 'warn', sub: '허브 준비 전' });
  assert.deepEqual(tileInfo(app({ usage: { last30d: 0, lastUsedAt: day(40) } }), NOW), { tone: 'muted', sub: '쉬는 중' });
  assert.deepEqual(tileInfo(app({ hidden: true }), NOW), { tone: 'ok', sub: '30일 3회' }); // 숨김 표시는 칸 흐림으로만
  assert.deepEqual(tileInfo(app({ usage: null, category: '돈' }), NOW), { tone: 'ok', sub: '' }); // 분류는 칸 아래에 쓰지 않는다(칩으로 구분)
});

test('분류 칩: 앱이 있는 분류만 정해진 순서로, 분류가 하나뿐이면 칩 없음', () => {
  assert.deepEqual(chipList([{ category: '건강' }, { category: '돈' }, { category: '돈' }]), ['전체', '건강', '돈']);
  assert.deepEqual(chipList([{ category: '돈' }, { category: '돈' }]), []);
  assert.deepEqual(chipList([{ category: '' }, { category: '기타' }, { category: '생활' }]), ['전체', '생활', '기타']);
  assert.deepEqual(chipList([]), []);
});

test('분류 칩 키보드 이동: 화살표·처음·끝, 끝에서 돌기, 오른쪽→왼쪽 언어', () => {
  assert.equal(chipKeyTarget('ArrowRight', 0, 4), 1);
  assert.equal(chipKeyTarget('ArrowDown', 3, 4), 0); // 끝에서 처음으로
  assert.equal(chipKeyTarget('ArrowLeft', 0, 4), 3); // 처음에서 끝으로
  assert.equal(chipKeyTarget('ArrowUp', 2, 4), 1);
  assert.equal(chipKeyTarget('Home', 2, 4), 0);
  assert.equal(chipKeyTarget('PageUp', 2, 4), 0);
  assert.equal(chipKeyTarget('End', 0, 4), 3);
  assert.equal(chipKeyTarget('PageDown', 0, 4), 3);
  assert.equal(chipKeyTarget('ArrowLeft', 1, 4, 'rtl'), 2);
  assert.equal(chipKeyTarget('Enter', 1, 4), null);
  assert.equal(chipKeyTarget('ArrowRight', 0, 0), null);
  assert.equal(chipKeyTarget('ArrowRight', -1, 3), 1); // 고른 칸을 못 찾으면 첫 칸 기준
});

test('알림 목록: 진행 중 알림은 다음 알림이 오면 빠지고, 최대 3개, 같은 글은 하나만', () => {
  let l = [];
  l = pushToast(l, { text: '확인하는 중', kind: 'busy' });
  l = pushToast(l, { text: '3개 확인', kind: 'info' });
  assert.deepEqual(l.map(t => t.text), ['3개 확인']);
  l = pushToast(l, { text: '오류', kind: 'error' });
  l = pushToast(l, { text: 'a', kind: 'info' });
  l = pushToast(l, { text: 'b', kind: 'info' });
  assert.deepEqual(l.map(t => t.text), ['오류', 'a', 'b']);
  l = pushToast(l, { text: '오류', kind: 'error' });
  assert.deepEqual(l.map(t => t.text), ['a', 'b', '오류']);
  assert.equal(toastTimeout('info'), 5000);
  assert.equal(toastTimeout('error'), 0);
  assert.equal(toastTimeout('busy'), 0);
});
