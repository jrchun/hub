# 앱 허브 (hub)

app_starter로 만든 내 앱들을 폰 한 화면에서 카드로 모아 보는 곳입니다. 1인용.

- 사이트: https://hub.woongstudio.com (예비: https://hub.tedcheon.workers.dev)
- 앱마다 이름·설명·상태·대표 화면·최근 30일 사용량을 보여 줍니다.
- 앱은 배포될 때 스스로 등록합니다(`POST /api/register`). 매일 08:00(KST)에 허브가 앱들을 둘러보며 살아 있는지 확인합니다.
- 읽기는 누구나, 숨기기·삭제·"지금 확인"은 편집 암호가 있어야 합니다(사이트에서 처음 "편집"을 누를 때 정함).

## 앱이 허브에 주는 것 (app_starter `docs/HUB.md`)

| 주소 | 내용 |
|---|---|
| `<앱>/app.json` | 이름·이모지·한 줄 설명·분류·상태·공개 여부 |
| `<앱>/api/health` | `ok`, `starter`(허브 연동 버전, 없으면 예전 앱), `usage`(`{last30d, lastUsedAt}`) |
| `<앱>/og.png` | 대표 화면(폰 폭 캡처) |

판정: **정상**(health `ok`) · **응답 없음**(실패, 연속 실패 횟수를 셈) · **허브 준비 전**(`app.json`이 없거나 `starter`가 없음).

## API

| 요청 | 하는 일 | 편집 암호 |
|---|---|---|
| `POST /api/register {"url": "https://<앱>.woongstudio.com", "replaces"?: "<옛 주소>"}` | 등록(같은 주인 주소만: 허브 주소의 도메인 + `OWNER_DOMAINS`, 다른 주인은 403, 같은 주소 1분에 한 번, 넘으면 429). 새로 등록 201, 이미 있으면 200. `replaces`를 주면 두 주소의 `app.json`이 같을 때 옛 줄을 새 주소로 옮긴다(숨김·등록일 이어받음) | 필요 없음 |
| `GET /api/apps` | 카드 목록(암호가 없으면 숨긴 앱은 뺌) | 필요 없음 |
| `PUT /api/apps {"url", "hidden"}` | 숨기기/보이기 | 필요 |
| `DELETE /api/apps?url=<주소>` | 삭제 | 필요 |
| `POST /api/refresh` | 지금 확인(매일 예약 작업과 같은 동작) | 필요 |

## 지켜야 할 것 (함정)

- `wrangler.toml`의 `compatibility_flags = ["global_fetch_strictly_public"]`가 없으면 같은 계정의 다른 `workers.dev` 앱을 불러올 수 없다(오류 1042). 내 도메인(직접 연결 도메인)의 앱은 같은 도메인 안에서 `fetch()`로 부를 수 있다(Cloudflare 문서 Routing).
- "같은 주인" = 허브 주소의 도메인(`hub.woongstudio.com` → `woongstudio.com`, workers.dev면 `<계정>.workers.dev`) + `wrangler.toml` `[vars] OWNER_DOMAINS`. `pages.dev`처럼 누구나 만드는 주소는 주인으로 치지 않는다.
- 무료 플랜은 한 번 실행에 바깥 요청 50개까지 → 앱당 2개이므로 한 번에 25개까지, 오래 확인 안 한 앱부터.
- 앱에서 받은 글자는 믿지 않는다: 화면에는 `textContent`로만 넣고, 그림 주소는 등록 주소 + `/og.png`로만 만든다. 응답이 100KB를 넘으면 버리고, 리다이렉트는 따라가지 않는다.

## 구조

| 역할 | 위치 |
|---|---|
| 화면(빌드 없음) | `web/` — 규칙은 `web/js/view.js`(순수 함수), 그리기는 `web/js/app.js` |
| API | `src/worker.js`, `src/api/` |
| 허브 규칙(주소 정리·계정 비교·판정·25개 선택) | `src/lib/hub.js`(순수 함수), 저장은 `src/lib/store.js` |
| 매일 둘러보기 | `src/jobs.js`, `wrangler.toml` `[triggers]`(`0 23 * * *` = 08:00 KST) |
| 저장 | Cloudflare D1, `db/schema.sql` |
| 배포 | `main`에 합치면 Cloudflare Workers Builds가 자동 배포. 준비 도구는 `scripts/cf_mcp.mjs` |

```
npm test                                                  # 테스트(node 내장 SQLite로 실제 SQL까지 확인)
cp .dev.vars.example .dev.vars
npx wrangler@4 d1 execute hub --local --file db/schema.sql
npx wrangler@4 dev --host hub.woongstudio.com            # http://localhost:8787 (--host가 있어야 등록 시 주인 비교가 됨)
npm run check -- https://hub.woongstudio.com              # 배포 검사
```

이 저장소는 [app_starter](https://github.com/jrchun/app_starter) 틀로 만들었습니다. 작업 규칙은 [`CLAUDE.md`](CLAUDE.md), 배포 절차는 [`docs/AGENT_SETUP.md`](docs/AGENT_SETUP.md)·[`docs/SETUP.md`](docs/SETUP.md).
