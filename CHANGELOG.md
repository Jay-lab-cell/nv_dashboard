# CHANGELOG

---

## [v3.1.0] — 2026-03-07

### 버그 수정

- **순위조회 후 상태변경 로그 미표시 수정**
  - `handleCheckCurrentRank` SSE `done` 이벤트 수신 후 `fetchLogs(taskId)` 미호출 문제 수정
  - 아코디언이 열려있는 상태에서도 로그 즉시 갱신됨

- **상태변경 로그 중복 표시 제거**
  - 동일한 메시지(`new_status + message` 키 기준) 중복 필터링 적용
  - 최신 1건만 표시 (내림차순 정렬 후 deduplication → 오름차순 복원)

- **정산이관 즉시 대시보드에서 미삭제 문제 수정**
  - `mainStatuses` 필터에서 `STATUS.SETTLEMENT` 예외 조건 제거
  - 정산이관 즉시 메인 탭 목록에서 사라지고 정산 아카이브 탭으로 이동

### 기능 개선

- **현재 순위 표기 개선 (게시글 번호 기준)**
  - URL 마지막 숫자 세그먼트로 게시글 번호 추출 (`_extract_article_id()`)
  - `initial_url` vs `url` 게시글 번호 비교 → `(유지중)` / `(URL바뀜)` suffix 추가
  - 표기 예: `2/5(유지중)`, `3/5(URL바뀜)`

- **정산 아카이브 탭 개선**
  - "업체별 총 정산 금액" → "업체별 정산내역" (금액 합산 → 건수 집계)
  - 정산일 필터: date input 2개 (시작/종료) → 월별 드롭다운 단일 필터
  - 드롭다운 옵션은 DB 데이터 기준 동적 생성 ("전체" 포함)
  - 금액 컬럼 제거, "정산이관일" 컬럼으로 변경

- **순위 `/` 구분자 색상**
  - 최초순위 / 현재순위 구분자를 파란색(`var(--accent-blue)`, bold)으로 강조

- **댓글 셀렉터 추가**
  - `crawler.py` `_sync_check_post()` 내 `comment_selectors`에 `"div.text_comment"` 추가

### 파일 변경 목록

| 파일 | 변경 내용 |
|------|---------|
| `backend/main.py` | `_extract_article_id()` 추가, `_run_check_rank()` suffix 처리 |
| `backend/crawler.py` | `comment_selectors`에 `div.text_comment` 추가 |
| `dashboard/app/page.js` | 로그 갱신, 중복 제거, 정산 필터, 건수 집계, 순위 색상 |

---

## [v3.0.0] — 2026-03-07

### 아키텍처 전면 개편 (v2 → v3)

**백엔드**

- Next.js API Routes 제거 → Python FastAPI 독립 백엔드 (port 8001)
- DB: Google Sheets → SQLite + aiosqlite (응답 속도 ~100x 향상)
- 실시간 통신: 1초 HTTP 폴링 → SSE (Server-Sent Events, sse-starlette)
- 크롤러: Node.js playwright-extra → Python playwright sync_api + ThreadPoolExecutor(max=3)
- 스케줄러: 매 1시간 자동 24h 경과 태스크 검증 (APScheduler AsyncIOScheduler)

**프론트엔드**

- `dashboard/app/page.js` Next.js 단일 페이지 유지
- API 호출 대상: Next.js API Routes → FastAPI 백엔드 (`NEXT_PUBLIC_API_URL`)
- SSE EventSource 구독으로 실시간 작업 진행 상태 표시

**버그 수정**

- playwright 버전 불일치 해결: `requirements.txt` `playwright==1.49.1` → `1.58.0`
- Windows 포트 충돌(Error 10048) 해결: `start_backend.bat` 포트 정리 자동화
- `asyncio.get_event_loop()` deprecated → `asyncio.get_running_loop()` 교체
- PUT 엔드포인트 camelCase/snake_case 불일치 수정 (`taskId`/`task_id` 양쪽 허용)

**신규 파일**

- `backend/main.py` — FastAPI 앱
- `backend/crawler.py` — Playwright 병렬 크롤러
- `backend/database.py` — aiosqlite CRUD
- `backend/models.py` — Pydantic 모델
- `backend/scheduler.py` — APScheduler
- `backend/requirements.txt`
- `start_backend.bat` — 원클릭 백엔드 시작

---

## [v2.x] — 이전 버전 (레거시)

- **위치**: `dashboard/` (Next.js App Router + Google Sheets API)
- **DB**: Google Sheets (서비스 계정 인증, `lib/sheets.js`)
- **크롤러**: `lib/crawler.js` (playwright-extra + stealth plugin)
- **상태**: v3으로 대체됨. `dashboard/app/api/` 디렉터리 내 API 라우트는 더 이상 사용하지 않음.

---

## [v1.x] — 초기 버전 (레거시)

- **위치**: `N_keyword_monitoring/` (별도 디렉터리)
- **DB**: SQLite + aiosqlite
- **프론트**: 정적 HTML (`static/`)
- **상태**: 안정 버전. v3과 독립적으로 동작 가능.
