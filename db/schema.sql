-- D1(SQLite) 스키마. 여러 번 실행해도 안전하다. 표를 추가하면 여기에 적고 다시 적용한다(Cloudflare MCP: node scripts/cf_mcp.mjs prepare, 또는 wrangler d1 execute --remote).

-- 등록된 앱. 앱에서 받은 원문(app.json, /api/health)은 그대로 저장하고, 화면에 쓸 값은 읽을 때 꺼낸다(src/lib/hub.js).
-- 앱 쪽 형식이 바뀌어도 저장은 깨지지 않게 하려는 것이다.
CREATE TABLE IF NOT EXISTS apps (
  url TEXT PRIMARY KEY,             -- https://<앱>.woongstudio.com 또는 https://<앱>.<계정>.workers.dev (경로 없음, 소문자)
  meta TEXT,                        -- app.json 원문(JSON 글자). 없으면 NULL(허브 준비 전 예전 앱)
  health TEXT,                      -- /api/health 원문(JSON 글자)
  state TEXT NOT NULL DEFAULT 'down', -- ok(정상) | down(응답 없음) | legacy(허브 준비 전)
  fail_count INTEGER NOT NULL DEFAULT 0, -- 연속 실패 횟수
  checked_at TEXT,                  -- 마지막으로 확인한 시각
  ok_at TEXT,                       -- 마지막으로 응답한 시각(정상 또는 허브 준비 전)
  registered_at TEXT NOT NULL,
  hidden INTEGER NOT NULL DEFAULT 0 -- 1이면 편집 암호가 없는 사람에게 안 보인다
);

-- 등록 요청 횟수 제한(같은 주소는 1분에 한 번). key = 앱 주소, at = 마지막 요청 시각(밀리초).
CREATE TABLE IF NOT EXISTS rate_limit (
  key TEXT PRIMARY KEY,
  at INTEGER NOT NULL
);

-- 설정값. 사이트에서 처음 정한 편집 암호의 해시(key = 'write_hash', 값 = 소금:SHA-256)가 들어간다. 원문은 저장하지 않는다.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 예약 작업 기록(src/jobs.js).
CREATE TABLE IF NOT EXISTS job_log (
  ts TEXT NOT NULL,
  job TEXT NOT NULL,
  note TEXT NOT NULL
);

-- 사용 기록. 편집 암호를 가진 기기에서 열거나 고쳤을 때만 남는다(방문자는 세지 않는다).
CREATE TABLE IF NOT EXISTS usage_log (
  ts TEXT NOT NULL,
  event TEXT NOT NULL
);
