# N_Mornitoring v3 — 인수인계 문서

> 작성일: 2026-03-07

---

## 1. 프로젝트 개요

네이버 카페 키워드 노출 모니터링 서비스 (v3).

- **백엔드**: Python FastAPI (port 8001) + SQLite
- **프론트엔드**: Next.js (port 9000), `dashboard/app/page.js` 단일 페이지

v2(Next.js API Routes + Google Sheets)에서 v3으로 전환하면서:
- DB: Google Sheets → SQLite (응답 1-3초 → 10ms 미만)
- 실시간: 1초 HTTP 폴링 → SSE (Server-Sent Events)
- 크롤러: Node.js playwright-extra → Python playwright sync_api + ThreadPoolExecutor

---

## 2. 디렉터리 구조

```
N_Mornitoring_260307/
├── backend/
│   ├── main.py          # FastAPI 앱, SSE 엔드포인트, 비즈니스 로직
│   ├── crawler.py       # Playwright 크롤러 (URL 수집 + 게시글 방문)
│   ├── database.py      # aiosqlite CRUD
│   ├── models.py        # Pydantic 모델, KeywordStatus Enum
│   ├── scheduler.py     # APScheduler (1시간 간격 자동 검증)
│   ├── monitor.db       # SQLite DB (gitignore 대상)
│   ├── requirements.txt
│   └── .env             # 환경변수 (비어있어도 동작)
├── dashboard/
│   ├── app/
│   │   └── page.js      # 메인 대시보드 (전체 UI)
│   ├── .env.local        # NEXT_PUBLIC_API_URL=http://localhost:8001
│   └── package.json
└── start_backend.bat    # 백엔드 원클릭 시작 스크립트
```

---

## 3. 실행 방법

### 백엔드 (port 8001)
```bash
# 방법 1: 배치 파일 (권장)
start_backend.bat

# 방법 2: 수동
cd backend
.venv\Scripts\activate
uvicorn main:app --port 8001 --log-level info
```

### 프론트엔드 (port 9000)
```bash
cd dashboard
npm run dev
```

브라우저: http://localhost:9000

---

## 4. 핵심 아키텍처

### 크롤러 흐름
1. `_sync_collect_urls(keyword)` — 네이버 통합검색 결과 페이지에서 `cafe.naver.com` 링크 수집 (직렬, 1회)
2. `_sync_check_post(url, brand, rank)` — 개별 게시글 방문, `iframe#cafe_main` 내 댓글 영역에서 브랜드명 검색 (병렬, ThreadPoolExecutor max=3)

### SSE 흐름
- 클라이언트 → `POST /api/check-exposure` or `POST /api/check-current-rank` → job_id 반환
- 클라이언트 → `GET /api/events/{job_id}` SSE 구독 → `pending` / `running` / `done` / `error` 이벤트 수신

### 상태 머신 (KeywordStatus)
```
REGISTERED
  → (노출 확인) → EXPOSED
  → (건바이 성공) → SUCCESS
  → (정산 이관) → SETTLEMENT
  → (정산 완료) → SETTLEMENT_DONE
  → (미노출) → REPOST_NEEDED
```

### 순위 표기
`current_rank` 컬럼에 `"2/5(유지중)"` 또는 `"2/5(URL바뀜)"` 형태로 저장.
- 게시글 번호(URL 마지막 숫자) 기준으로 initial_url vs 현재 url 비교

---

## 5. API 엔드포인트 목록

| Method | Path | 설명 |
|--------|------|------|
| GET | `/api/tasks` | 전체 태스크 조회 |
| POST | `/api/tasks` | 태스크 생성 |
| PUT | `/api/tasks` | 태스크 상태/필드 수정 |
| DELETE | `/api/tasks/{id}` | 태스크 삭제 |
| GET | `/api/logs` | 상태변경 로그 조회 (`?taskId=...`) |
| POST | `/api/check-exposure` | 최초 노출 확인 (비동기 job) |
| POST | `/api/check-current-rank` | 현재 순위 확인 (비동기 job) |
| GET | `/api/events/{job_id}` | SSE 이벤트 스트림 |
| GET/POST | `/api/scheduler` | 자동 스케줄러 상태 조회/제어 |

---

## 6. 알려진 이슈 및 주의사항

### playwright 버전
- venv에 `playwright==1.58.0` 설치 필수
- 브라우저 바이너리 버전과 반드시 일치해야 함
- 불일치 시 `Connection closed while reading from the driver` 오류 발생
- 설치 명령: `pip install "playwright==1.58.0" && playwright install chromium`

### Windows 포트 충돌
- 기존 uvicorn 프로세스 미종료 시 Error 10048 발생
- `start_backend.bat`이 포트 정리를 자동으로 처리함
- 수동 종료: PowerShell `netstat -ano | findstr :8001` → `Stop-Process -Id <PID> -Force`

### Git Bash에서 Python 실행
- `playwright install` 등 일부 명령이 Git Bash에서 segfault 발생
- PowerShell 또는 CMD 사용 권장

### 순위 정확도
- 현재 전체 페이지 `a[href]` 스캔 방식 → 순위가 실제 노출 순위와 다를 수 있음
- 개선 방향: 통합검색 카페 섹션 특정 셀렉터(`#section_cafe`, `.cafe_view_area`) 우선 사용 (미구현)

---

## 7. 미구현 / 개선 예정 항목

| 항목 | 우선순위 | 설명 |
|------|---------|------|
| 순위 정확도 개선 | 높음 | 통합검색 카페 섹션 셀렉터 우선 사용, 상위 3→5개 방문 |
| 랜덤 딜레이/viewport | 중간 | 크롤러 차단 방지 |
| DB 백업 | 낮음 | monitor.db 정기 백업 스크립트 |
| 테스트 코드 | 낮음 | crawler, database, scheduler 단위 테스트 |

---

## 8. 환경 변수

**`backend/.env`** (현재 비어있어도 동작)
```
# 필요 시 추가
```

**`dashboard/.env.local`**
```
NEXT_PUBLIC_API_URL=http://localhost:8001
```

---

## 9. 의존성

**백엔드 (`backend/requirements.txt`)**
- `fastapi`, `uvicorn[standard]`
- `aiosqlite`
- `playwright==1.58.0`
- `sse-starlette`
- `apscheduler`
- `loguru`
- `python-dotenv`

**프론트엔드 (`dashboard/package.json`)**
- Next.js (App Router, JS)
- 별도 크롤러 의존성 없음 (모든 크롤링은 백엔드 담당)
