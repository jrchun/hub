# 프로젝트 규칙 (새 프로젝트 시작 틀)

## 언어: 항상 한국어 (가장 먼저 지킬 것)
- 이 저장소에서 하는 모든 대화는 **한국어**로 한다. 세션이 새로 시작돼도, 사용자가 짧게 말해도, 영어로 된 도구 출력·오류·문서를 읽은 뒤에도 마찬가지다.
- 진행 알림, 질문, 보고, 오류 설명, 승인 창을 띄우기 전 설명, 커밋 메시지, PR 제목·설명, 코드 주석, 문서까지 모두 한국어로 쓴다.
- 사용자는 개발 지식이 많지 않다. 전문 용어는 처음 나올 때 쉬운 말로 풀어 쓴다. 예: "배포(사이트에 올리기)", "PR(변경을 합쳐 달라는 요청)", "Merge(합치기)".
- 명령어, 파일 이름, 오류 원문은 그대로 두되 무슨 뜻인지 한국어로 덧붙인다.
- 무엇을 할지 먼저 한 줄로 말하고, 끝나면 결과(된 것, 안 된 것, 사람이 할 일)를 말한다.

**새 앱을 만들거나 배포하라는 요청이면 먼저 `docs/AGENT_SETUP.md`를 읽고 그 순서를 따른다.** (Codex 등은 `AGENTS.md`)
Cloudflare 연결은 MCP(브라우저 로그인)로 한다. **API 토큰을 만들게 하지 않는다.** 앱마다 사용자 계정의 GitHub 저장소가 있고, `main`에 올리면 Cloudflare가 자동 배포한다.

내 도메인: woongstudio.com
- 앱 주소는 `https://<앱이름>.<내 도메인>`. 이 줄 한 곳에만 둔다. `cf_mcp.mjs fill`이 읽어 `wrangler.toml`에 넣는다(Cloudflare가 DNS·인증서 자동). 옛 `workers.dev` 주소도 예비로 계속 열린다(`workers_dev = true`). 자세한 것은 app_starter `docs/DOMAIN.md`.

허브 주소: https://hub.woongstudio.com
- 이 저장소가 앱 허브 자신이다(만든 앱들을 모아 보여 주는 페이지). 허브는 자기 자신을 등록하지 않는다(`/api/register`가 거절한다). 예비 주소 `https://hub.tedcheon.workers.dev`도 같은 허브다.
- 등록은 **같은 주인**의 앱만 받는다: 허브 주소의 도메인(`woongstudio.com`)과 `wrangler.toml` `[vars] OWNER_DOMAINS`에 적은 것(`woongstudio.com,tedcheon.workers.dev`). 예외로 `OWNER_HOSTS`에 적은 정확한 주소 하나하나(`haenya.pages.dev`, 했냐를 옮기기 전까지)도 받는다. 주소를 옮긴 앱은 `{"url":"<새 주소>","replaces":"<옛 주소>"}`로 보내면 두 주소의 `app.json`이 같을 때 옛 줄을 새 주소로 옮긴다.

## 구성
- 이 앱: **앱 허브**. app_starter로 만든 앱들을 카드로 모아 본다. 자세한 동작·API·함정은 `README.md`.
- `web/app.json`·`web/og.png`·`/api/health`의 `starter`·`usage`: 허브 자신의 자기소개서·대표 화면·상태(`docs/HUB.md`).
- 화면은 하나지만 **방문자는 카드만**(이름·그림·설명·분류, 서버도 `publicView` 값만 보냄), **주인(허브 로그인)은 상태·사용량·관리 기능까지**. 화면 제목은 "웅 스튜디오"(2026-11-25, 저장소·주소·기능 이름 "앱 허브"는 그대로). 로그인 입구는 그 제목(누르면 암호 창). 화면은 격자 하나(보기 전환 없음), 앱을 누르면 설명 창 + [열기 →](주인에게는 숨기기·삭제도). README "방문자와 주인".
- 디자인: **"세이지 내추럴"**(2026-11-25, 공장 디자인을 대신함). 연한 쑥색 바탕, 차분한 초록 포인트(`--accent`), 테두리 대신 부드러운 그림자(`--shadow`), 둥근 모서리(`--radius` 하나에서 계산). 글꼴은 제목·앱 이름 고운바탕(`--serif`), 본문 고운돋움(`--sans`). 꾸밈 그림 없이 깔끔하게. 색·그림자는 `web/styles.css` 맨 위 변수만 쓴다. 움직임은 `prefers-reduced-motion`이면 멈춘다.
- 화면 부품(창·칩·알림·버튼)을 새로 만들거나 고도화할 때는 `docs/UI_PATTERNS.md`(shadcn/ui·Base UI·Radix의 색 변수·상태 속성·키보드·움직임 규칙을 빌드 없는 화면용으로 정리)를 먼저 본다. 세 라이브러리는 React 전용이라 설치하지 않는다.
- `web/`: 정적 화면(빌드 없음). 규칙(정렬·배지·링크 숨김)은 `web/js/view.js`의 순수 함수, 그리기·이벤트는 `web/js/app.js`, 서버 통신은 `web/js/api.js`. 앱에서 받은 글자는 `textContent`로만 넣는다(innerHTML 금지).
- `src/worker.js`: `/api/*`만 처리. 새 API는 `src/api/<이름>.js`에 `GET/PUT/POST/DELETE`를 만들고 `ROUTES`에 추가. 허브 API는 `register`(등록, 비밀값 없음·같은 주인만, `replaces`로 주소 옮기기)·`apps`(목록·숨기기·삭제)·`refresh`(지금 확인)·`login`/`logout`/`session`(허브 로그인: 한 번 로그인하면 woongstudio.com 아래 앱 전부 편집, `src/lib/session.js`, README "허브 로그인").
- `src/lib/hub.js`: 주소 정리·주인 비교(`ownerOf`: 내 도메인 또는 workers.dev 계정)·앱 확인(100KB 제한, 리다이렉트 안 따라감, 10초 제한)·판정·25개 선택(순수 함수). `src/lib/store.js`: D1 읽기·쓰기.
- `src/jobs.js`: 매일 08:00 KST(`wrangler.toml` `[triggers] crons = ["0 23 * * *"]`, UTC) 등록된 앱 둘러보기. 무료 플랜은 계정 전체 Cron 5개, 한 번 실행에 바깥 요청 50개(앱당 2개 → 25개).
- `wrangler.toml`: `compatibility_flags = ["global_fetch_strictly_public"]`를 지우지 않는다(같은 계정 workers.dev 앱을 못 부름, 오류 1042). 배포 절차와 함정은 `docs/SETUP.md`.
- `db/schema.sql`: D1 스키마(`CREATE TABLE IF NOT EXISTS`만). 바꾸면 `node scripts/cf_mcp.mjs prepare`로 만든 코드를 Cloudflare MCP `execute`로 실행해 적용.
- `scripts/cf_mcp.mjs`: Cloudflare MCP `execute`에 넘길 코드를 만든다(`address`·`prepare`·`fill`·`connect`·`domain`·`status`, 예비 `deploy`). 실제로 Cloudflare에서 도는 코드는 `scripts/cf_mcp/remote.js`.
- 허브는 D1 모드 전용이다(틀의 Supabase 모드와 메모 예제는 지웠다).

## 지켜야 할 것
- 화면은 빌드 없는 정적 파일. React·번들러·CSS 프레임워크를 들이지 않는다. 외부 스크립트는 글꼴(Google Fonts)만.
- **이모지를 쓰지 않는다**: 화면, 문구, 자기소개서(`app.json`), 문서, 커밋·PR까지. AI가 만든 티가 난다. 아이콘이 필요하면 글자, 일반 기호(✕ 등), 직접 그린 SVG로.
- 색은 `web/styles.css`의 CSS 변수만 쓴다. **라이트·다크와 폰 폭 400px을 매번 확인**한다(가로 스크롤 없음).
- 읽기는 누구나, 쓰기는 편집 암호가 있어야 한다. 편집 암호는 사람이 사이트에서 처음 "편집"을 누를 때 화면에서 정한다(D1 `settings`에 해시로 저장, `src/api/password.js`). 이 암호가 **허브 로그인 암호**이기도 하다(다른 앱 편집 권한까지 걸려 있으니 다른 곳에서 쓰지 않는 암호로). 대시보드 Secret `WRITE_TOKEN`이 있으면 그것이 우선. 암호 원문을 채팅·저장소에 두지 않는다.
- 모르는 외부 API 사양은 추측하지 말고 공식 문서를 확인한다(Cloudflare 문서는 `https://developers.cloudflare.com/<경로>/index.md`로 마크다운을 받을 수 있다).
- 계산·규칙은 DOM에 접근하지 않는 순수 함수로 두고 `tests/`에 테스트를 붙인다.
- 큰 기능을 바꾸면 `web/app.json`의 `updatedAt`을 그날 날짜로 고친다(화면이 크게 바뀌면 `og.png`도 다시 찍는다). `app.json`은 누구나 볼 수 있고, `public: false`는 허브에서 링크만 숨기는 표시일 뿐 보안 장치가 아니다.

## 작업 흐름
1. 고친 뒤 `npm test`(node + python 테스트)와 로컬 실행(`npx wrangler@4 dev`, 편집 암호는 `.dev.vars`)으로 확인한다.
2. 고친 것은 PR로 올리고, `npm test` 통과와 화면 확인이 끝나면 **AI가 직접 Merge한다**(사용자가 미리 허락함. 사용자가 "합치기 전에 보여 줘"라고 했거나 데이터를 지우는 변경이면 기다린다). `main`에 들어가면 Cloudflare(Workers Builds)가 자동 배포한다. 앱의 첫 연결은 AI가 `cf_mcp.mjs connect`로 하고, 안 되면 사람이 Cloudflare "만들기 › GitHub"를 한다. 배포 뒤 **반드시** `node scripts/check_site.mjs <사이트 주소>`로 실제 사이트를 확인하고, 화면은 브라우저로 폰 폭에서 본다. "배포했습니다"로 끝내지 않는다.
3. 사람에게 맡겨야 하는 일(AI가 못 한 Cloudflare 연결, 사이트에서 편집 암호 정하기)은 `docs/AGENT_SETUP.md`·`docs/SETUP.md`의 해당 줄과 함정을 그대로 안내한다. 그 밖의 일로 사람을 부르지 않는다.
4. 미뤄 둔 일은 `docs/BACKLOG.md`에 적는다(기능 완성도가 디자인보다 먼저). 사용자가 "백로그 진행"이라고 하면 거기서 꺼내 처리한다.

## 실행
- 로컬: `cp .dev.vars.example .dev.vars && npx wrangler@4 d1 execute <이름> --local --file db/schema.sql && npx wrangler@4 dev` (예약 작업 시험: `--test-scheduled` 후 `/__scheduled`)
- 테스트: `npm test`
- 배포 확인: `npm run check -- https://hub.woongstudio.com` (예비 `https://hub.tedcheon.workers.dev`)
- Cloudflare 준비·연결: `node scripts/cf_mcp.mjs prepare --name <저장소 이름>` → 생긴 `.wrangler/mcp/prepare.js`를 MCP `execute`로 → `fill` → PR Merge → `connect`(GitHub 번호는 `gh api -X GET search/repositories`)
