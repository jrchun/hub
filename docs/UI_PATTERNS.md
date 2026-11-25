# 화면 부품 규칙 (shadcn/ui · Base UI · Radix에서 배운 것)

화면을 고도화할 때 이 문서를 먼저 본다. 세 라이브러리는 모두 **React 전용**이라 이 저장소(빌드 없는 정적 화면, React·번들러·CSS 프레임워크 금지)에 설치하지 않는다.
대신 그 안의 **설계 규칙**(색 변수 이름 짓기, 상태 표시, 키보드·초점 동작, 등장·퇴장 움직임)을 그대로 따라 순수 HTML·CSS·JS로 만든다.
디자인 분위기("꼬마 앱 공장", CLAUDE.md)는 바꾸지 않는다. 이 문서는 "어떻게 동작해야 하나"의 기준이다.

확인한 판(2026-11-25): shadcn 저장소 `main`(apps/v4), `@base-ui/react` 1.9.0(패키지 안 `docs/`), `@radix-ui/react-dialog` 1.3.1 · `react-toggle-group` 1.2.1 · `react-roving-focus` 1.2.1 · `react-tooltip` 1.4.1(코드).
공식 사이트(ui.shadcn.com, base-ui.com, radix-ui.com)는 클라우드 세션 접속 허용 목록에 없어 막힌다. 다시 볼 때는 아래 "다시 확인하는 법"대로 npm 패키지와 GitHub 원본 파일로 본다.

## 1. 세 라이브러리는 무엇인가
| 이름 | 한 줄 | 우리가 가져올 것 |
|---|---|---|
| Radix Primitives | 모양 없는(unstyled) 부품. 접근성·키보드·초점만 책임진다 | 키보드 표, `data-state` 상태 표시, 초점 가두기·되돌리기 |
| Base UI | Radix 만든 사람들 일부가 MUI와 새로 만든 모양 없는 부품(옛 이름 `@base-ui-components/react` → 지금 `@base-ui/react`) | `data-open`·`data-starting-style` 등 상태 속성, CSS 전환으로 등장·퇴장 |
| shadcn/ui | 위 부품에 Tailwind 모양을 입힌 **복사해 쓰는 코드 모음**(설치형 라이브러리가 아님). 요즘은 Radix 대신 Base UI 위에서도 만든다(`style: "base-nova"`) | 색 변수 이름 체계, 버튼·배지 종류 이름, 둥글기 단계 |

## 2. 색 변수: "바탕 + 그 위 글자" 짝으로 (shadcn)
- 규칙: 바탕 변수 `--X`가 있으면 그 위에 올라가는 글자·아이콘 색은 `--X-foreground`. 바탕과 글자를 항상 짝으로 고르면 대비가 깨지지 않는다.
- shadcn 기본 이름: `background/foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `destructive`, `border`, `input`, `ring`, `chart-1~5`, `radius`. 다크는 같은 이름을 `.dark`에서 다시 정의한다(우리는 `prefers-color-scheme` + `data-theme` 세 경우, `web/styles.css` 맨 위).
- 둥글기: `--radius` 하나에서 단계를 계산한다(`sm = ×0.6`, `md = ×0.8`, `lg = ×1`, `xl = ×1.4`, `2xl = ×1.8`). 하나만 바꾸면 전체가 같이 바뀐다.
- 새 색이 필요하면 짝으로 추가한다(예: `--warning` + `--warning-foreground`, 라이트·다크 둘 다).

우리 변수와의 대응(이름은 지금 것을 유지하되 짝 규칙만 따른다):
| shadcn | 우리 | 비고 |
|---|---|---|
| `background` / `foreground` | `--bg` / `--fg` | |
| `card` | `--surface` | 앱 칸·창·관리 줄 |
| `muted` / `muted-foreground` | `--sunk` / `--muted` | |
| `primary` / `primary-foreground` | `--accent` / `--accent-ink` | 겨자색 버튼 |
| `accent`(마우스 올림 바탕) | `--accent-soft` | |
| `destructive` | `--bad`(+`--bad-soft`) | |
| `border` / `input` | `--line` | 꾸밈 테두리는 `--edge`, 그림자는 `--drop`(우리 고유) |
| `ring` | `--accent-text` | 초점 테두리 |
| `radius` | 없음(값이 흩어져 있음) | 고도화 후보: `--radius` 하나로 묶기 |

## 3. 버튼·배지 종류 이름 (shadcn)
- 버튼 `variant`: `default`(주요), `secondary`, `outline`, `ghost`, `destructive`, `link`. `size`: `xs`, `sm`, `default`, `lg`, `icon`(정사각형).
- 배지 `variant`: `default`, `secondary`, `destructive`, `outline`, `ghost`, `link`. 모양은 `rounded-full`, 작은 글자.
- 공통: 비활성은 `opacity .5` + 누를 수 없음, 초점은 3px 테두리(반투명 ring 색), 잘못된 입력은 `aria-invalid="true"`일 때 빨간 테두리.
- 우리 쪽 대응: `button`(=outline), `.primary`(=default), `.ghost`, `.danger`(=destructive). 종류를 늘릴 때 이 이름을 쓴다. 상태는 class 대신 `aria-*`·`data-*` 속성으로 스타일한다(예: `button[aria-invalid="true"]`).

## 4. 상태는 속성으로 표시하고 CSS가 그것을 본다
JS는 상태 속성만 바꾸고, 모양은 CSS가 속성을 보고 정한다. 이름은 두 라이브러리 것 중 하나로 통일한다.
| 상태 | Radix | Base UI | 우리 화면에서 |
|---|---|---|---|
| 열림/닫힘 | `data-state="open" / "closed"` | `data-open` / `data-closed` | `<dialog open>`(브라우저가 붙임) |
| 눌림(토글) | `data-state="on" / "off"` | `data-pressed` | `aria-pressed="true"`(분류 칩, 이미 씀) |
| 선택됨/켜짐 | `data-state="checked"` | `data-checked` / `data-unchecked` | 필요하면 `aria-checked` |
| 비활성 | `data-disabled` | `data-disabled` | `:disabled` |
| 키보드로 가리킴 | `data-highlighted` | `data-highlighted` | 메뉴를 만들면 |
| 방향·위치 | `data-orientation`, `data-side`, `data-align` | 같음 | 풍선 도움말을 만들면 |
| 등장 시작/퇴장 중 | (keyframes) | `data-starting-style` / `data-ending-style` | 아래 6장 |
- 접근성 속성(`aria-pressed`, `aria-checked`, `aria-expanded`)이 있으면 그것으로 스타일한다. 화면 읽기 프로그램과 모양이 어긋날 수 없다.

## 5. 부품별 동작 기준
### 창(Dialog) — Radix Dialog, Base UI Dialog
- 구조: 여는 버튼 → 어두운 뒤판(backdrop) → 창(popup) 안에 제목(Title)·설명(Description)·닫기(Close).
- 열리면 초점이 창 안으로 들어가고 Tab이 창 안에서만 돈다(초점 가두기). 닫히면 **연 버튼으로 초점이 돌아간다**.
- Esc로 닫힌다. 뒤판을 누르면 닫힌다(삭제 확인 같은 위험한 창은 예외 = AlertDialog: 바깥 눌러도 안 닫힘).
- 열린 동안 뒤 페이지는 스크롤되지 않고, 화면 읽기 프로그램에서 숨는다.
- `role="dialog"` + `aria-labelledby`(제목) + `aria-describedby`(설명). Radix는 제목이 없으면 경고를 낸다. 제목을 눈에 안 보이게 하더라도 넣는다.
- 우리 화면: 브라우저 내장 `<dialog>` + `showModal()`이 초점 가두기·Esc·뒤 페이지 숨기기·초점 되돌리기를 해 준다(지금 방식 유지). 직접 챙길 것: 뒤판 누르면 닫기(이미 함), `aria-describedby`, 열린 동안 스크롤 막기(`body:has(dialog[open]){overflow:hidden}`).

### 하나만 고르는 버튼 묶음(ToggleGroup single) — 분류 칩
- Radix는 하나만 고르는 묶음을 `role="radiogroup"` + 각 버튼 `role="radio"` `aria-checked`로 만든다(여럿 고르는 묶음은 `aria-pressed`).
- 키보드: 묶음 전체가 Tab 한 번. 안에서는 화살표(←↑ 이전, →↓ 다음), Home/PageUp 처음, End/PageDown 끝. 끝에서 처음으로 돈다(`loop`, Base UI `loopFocus` 기본 켜짐).
- 방법(roving tabindex, 돌아가는 Tab 자리): 지금 고른 칩만 `tabindex="0"`, 나머지는 `-1`. 화살표를 누르면 초점과 `tabindex="0"`을 옆 칩으로 옮긴다. 오른쪽에서 왼쪽 쓰는 언어는 좌우를 뒤집는다.

### 풍선 도움말(Tooltip)
- Radix: 마우스를 올리고 700ms 뒤 열림, 하나 닫고 300ms 안에 다른 것에 올리면 바로 열림. Base UI: 600ms, 400ms.
- 키보드 초점으로도 열린다. Esc로 닫힌다. `role="tooltip"`.
- **중요한 정보를 넣지 않는다.** 터치 화면에서는 볼 방법이 없다(Base UI 문서가 강조). 폰이 기준인 우리 화면에서는 거의 쓰지 않는다. 꼭 필요하면 누르면 열리는 작은 창(Popover)으로.

### 알림(Toast) — Base UI Toast
- 한 번에 최대 3개(`limit: 3`), 5초 뒤 자동으로 사라짐(`timeout: 5000`, 0이면 안 사라짐). 넘치면 오래된 것부터 뒤로 숨김(`data-limited`).
- 화면 읽기 프로그램이 읽도록 `aria-live`(평소 `polite`, 급하면 `assertive`). 밀어서 닫기 지원.
- 우리 화면의 `#status` 한 줄이 이 역할. 고도화 후보: 화면 아래 떠 있는 알림으로 바꾸고 5초 뒤 사라지게(오류는 남김).

## 6. 등장·퇴장 움직임
- Base UI 권장: **CSS keyframes보다 transition**. 여는 도중 닫으면 transition은 부드럽게 되돌아간다.
  ```css
  .Popup{transition:transform 150ms, opacity 150ms}
  .Popup[data-starting-style], .Popup[data-ending-style]{opacity:0; transform:scale(.9)}
  ```
- shadcn 창: 뒤판은 투명도만, 창은 투명도 + 크기 95%→100%, 200ms. 뒤판 색은 검정 50%.
- 우리 화면(JS 라이브러리 없음)에서는 브라우저 기능 `@starting-style`로 같은 효과를 낸다. 지원하지 않는 브라우저는 그냥 움직임 없이 열린다(기능은 그대로).
  ```css
  dialog{transition:opacity .2s, transform .2s, overlay .2s allow-discrete, display .2s allow-discrete; opacity:0; transform:scale(.95)}
  dialog[open]{opacity:1; transform:none}
  @starting-style{ dialog[open]{opacity:0; transform:scale(.95)} }
  ```
- 움직임 줄이기 설정(`prefers-reduced-motion: reduce`)이면 모두 끈다(이미 `styles.css` 끝에 있음).

## 7. 접근성 기본 (Base UI "Accessibility")
- 키보드 동작은 W3C WAI-ARIA Authoring Practices(APG)를 따른다. 새 부품을 만들면 APG의 해당 패턴 키보드 표를 먼저 본다.
- 초점 표시는 우리 책임: `:focus-visible`에 분명한 테두리(WCAG "focus appearance").
- 글자와 바탕 대비를 확인한다(Base UI는 APCA 기준 권장). 라이트·다크 둘 다.
- 그림만 있는 버튼에는 `aria-label`, 입력칸에는 `<label>`.

## 8. 이 허브에 적용할 후보 (우선순위 순)
1. 창 열고 닫을 때 부드럽게(6장 `@starting-style`), 창 열린 동안 뒤 스크롤 막기, `aria-describedby`.
2. 분류 칩을 `radiogroup` + 화살표 키 이동(5장). 순수 함수(다음 칸 번호 계산)는 `view.js` + `tests/`.
3. `#status`를 떠 있는 알림으로(5초 뒤 사라짐, 오류는 남김, `aria-live`).
4. 둥글기를 `--radius` 하나에서 계산(2장), 버튼 종류 이름 정리(3장).
5. 삭제 확인을 "두 번 누르기" 대신 위험 창(AlertDialog: 바깥 눌러도 안 닫힘, 초점은 [취소]에) 으로 바꿀지 검토.

## 다시 확인하는 법 (클라우드 세션)
- Base UI 문서 원문: `npm pack @base-ui/react` → 압축 풀면 `package/docs/react/...md`(부품별 속성 표 포함).
- Radix 동작: `npm pack @radix-ui/react-dialog`(등) → `package/dist/index.mjs`에서 `data-state`, `MAP_KEY_TO_FOCUS_INTENT` 등을 찾는다.
- shadcn: `https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/%28root%29/theming.mdx`, 부품 코드 `.../apps/v4/registry/new-york-v4/ui/<이름>.tsx`.
- 공식 사이트를 직접 열려면 환경의 접속 허용 목록에 `ui.shadcn.com`·`base-ui.com`·`www.radix-ui.com`을 추가해야 한다.
