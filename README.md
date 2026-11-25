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
| `POST /api/login {"password", "return"?}` | 허브 로그인. 쿠키 `hub_session`을 `SESSION_DOMAIN`(woongstudio.com) 전체에 둔다(90일). 같은 접속 위치에서 10분에 10번 틀리면 429. `return`이 같은 주인 주소면 `next`로 돌려준다 | 암호 |
| `POST /api/logout {"all"?}` | 로그아웃(쿠키 삭제). `all: true`면 모든 기기의 로그인 표시 무효 | `all`은 필요 |
| `POST /api/session {"token"}` / `GET /api/session` | 로그인 표시 확인(다른 앱의 서버가 부름) / 내 로그인 상태(쿠키) | 필요 없음 |

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

## 허브 로그인 (내 앱 전부 한 번에)

- 허브에서 "편집" → 편집 암호를 넣으면 로그인된다. 이 브라우저에서는 `woongstudio.com` 아래 다른 앱(허브 로그인이 켜진 app_starter 앱)도 다시 묻지 않고 저장된다. "잠그기" = 이 브라우저 로그아웃, "모든 기기에서 로그아웃" = 어디서든 무효.
- 다른 앱에서 "허브에서 로그인 →"을 누르면 `/?login=1&return=<앱 주소>`로 와서, 로그인 뒤 그 앱으로 돌아간다(같은 주인 주소만).
- 로그인 표시는 허브만 아는 열쇠로 서명한다(`src/lib/session.js`, D1 `settings.session_secret`). 편집 암호를 바꾸거나 초기화하면(`write_hash` 행 삭제) 모든 표시가 무효가 된다.
- 앱 쪽 동작·함정은 app_starter `docs/HUB.md` "허브 로그인".

## 방문자와 주인 (2026-11-25)

- **방문자**(로그인 안 함): 앱 카드(그림·이름·설명·"운영중" 표시)와 분류 칩·보기 방식(목록이 기본)만 보인다. 앱 개수·분류 글자는 따로 쓰지 않는다(분류는 칩으로 구분). 누르면 각 앱으로 간다. 서버도 이 값만 보낸다(`src/lib/hub.js` `publicView`: 응답 여부·실패 횟수·확인 시각·사용 기록·숨김은 안 보냄). 숨긴 앱은 안 보인다.
- **주인**(허브 로그인): 제목 "앱 허브"를 누르면 암호 창 → 로그인 → 상태 점·사용량·"지금 확인"·숨기기/삭제·"잠그기"·"모든 기기에서 로그아웃".
- 다른 앱의 "허브에서 로그인 →"(`/?login=1&return=`)은 바로 암호 창을 연다.
