"""
PostgreSQL (Supabase) 데이터베이스 관리 모듈
asyncpg로 FastAPI 비동기 이벤트 루프와 완벽 통합.
"""

import os
import asyncpg
from datetime import datetime, timedelta
from loguru import logger
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("SUPABASE_URL")
if not DATABASE_URL:
    raise ValueError("SUPABASE_URL environment variable is not set. Please check your .env file.")

# asyncpg pool 객체
pool = None

async def init_db():
    """데이터베이스 초기화 및 테이블/커넥션 풀 생성."""
    global pool
    try:
        pool = await asyncpg.create_pool(DATABASE_URL, min_size=1, max_size=10)
        async with pool.acquire() as db:
            await db.execute("""
                CREATE TABLE IF NOT EXISTS tasks (
                    id TEXT PRIMARY KEY,
                    keyword TEXT NOT NULL,
                    brand TEXT NOT NULL,
                    manager TEXT NOT NULL DEFAULT '',
                    company TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT '대기',
                    initial_rank TEXT DEFAULT '',
                    current_rank TEXT DEFAULT '',
                    amount TEXT DEFAULT '',
                    url TEXT DEFAULT '',
                    initial_url TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    verified_at TEXT DEFAULT '',
                    updated_at TEXT NOT NULL
                )
            """)
            await db.execute("""
                CREATE TABLE IF NOT EXISTS logs (
                    id TEXT PRIMARY KEY,
                    task_id TEXT NOT NULL,
                    prev_status TEXT DEFAULT '',
                    new_status TEXT NOT NULL,
                    changed_by TEXT NOT NULL DEFAULT 'SYSTEM',
                    message TEXT DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
                )
            """)
        logger.info("DB 초기화 완료 (PostgreSQL 연결 성공)")
    except Exception as e:
        logger.error(f"DB 초기화 실패: {e}")
        raise

async def close_db():
    """데이터베이스 커넥션 풀 종료."""
    global pool
    if pool:
        await pool.close()


# ────────────── Tasks ──────────────

async def get_all_tasks() -> list[dict]:
    """전체 태스크 조회 (최신 등록순)."""
    async with pool.acquire() as db:
        rows = await db.fetch("SELECT * FROM tasks ORDER BY created_at DESC")
        results = []
        for row in rows:
            d = dict(row)
            d["countdown_remaining"] = _calc_countdown(d)
            results.append(d)
        return results


async def get_task(task_id: str) -> dict | None:
    """특정 태스크 조회."""
    async with pool.acquire() as db:
        row = await db.fetchrow("SELECT * FROM tasks WHERE id = $1", task_id)
        return dict(row) if row else None


async def create_task(task: dict) -> dict:
    """태스크 생성."""
    async with pool.acquire() as db:
        await db.execute(
            """INSERT INTO tasks
               (id, keyword, brand, manager, company, status,
                initial_rank, current_rank, amount, url, initial_url,
                created_at, verified_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)""",
            task["id"], task["keyword"], task["brand"],
            task.get("manager", ""), task.get("company", ""),
            task.get("status", "대기"),
            task.get("initial_rank", ""), task.get("current_rank", ""),
            task.get("amount", ""), task.get("url", ""),
            task.get("initial_url", ""),
            task["created_at"], task.get("verified_at", ""),
            task["updated_at"],
        )
    return task


async def update_task(task_id: str, updates: dict) -> bool:
    """태스크 필드 업데이트."""
    if not updates:
        return False
    updates["updated_at"] = datetime.now().isoformat()
    sets = ", ".join(f"{k} = ${i+1}" for i, k in enumerate(updates.keys()))
    vals = list(updates.values())
    vals.append(task_id)  # parameter sequence id for WHERE 
    
    async with pool.acquire() as db:
        query = f"UPDATE tasks SET {sets} WHERE id = ${len(vals)}"
        await db.execute(query, *vals)
    return True


async def delete_task(task_id: str) -> bool:
    """태스크 삭제 (logs CASCADE 삭제)."""
    async with pool.acquire() as db:
        await db.execute("DELETE FROM tasks WHERE id = $1", task_id)
    return True


async def get_tasks_ready_for_24h_verify() -> list[dict]:
    """24시간 검증 대상 태스크 조회 (최초노출 후 24시간 경과)."""
    cutoff = datetime.now().isoformat()
    async with pool.acquire() as db:
        rows = await db.fetch(
            """SELECT * FROM tasks
               WHERE status = '최초 노출'
               AND verified_at != ''
               AND verified_at <= $1""",
            cutoff
        )
        return [dict(r) for r in rows]


# ────────────── Logs ──────────────

async def add_log(log: dict):
    """로그 추가."""
    async with pool.acquire() as db:
        await db.execute(
            """INSERT INTO logs
               (id, task_id, prev_status, new_status, changed_by, message, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7)""",
            log["id"], log["task_id"],
            log.get("prev_status", ""), log["new_status"],
            log.get("changed_by", "SYSTEM"),
            log.get("message", ""), log["created_at"],
        )


async def get_logs(task_id: str, limit: int = 50) -> list[dict]:
    """특정 태스크의 로그 조회."""
    async with pool.acquire() as db:
        rows = await db.fetch(
            "SELECT * FROM logs WHERE task_id = $1 ORDER BY created_at DESC LIMIT $2",
            task_id, limit
        )
        return [dict(r) for r in rows]


# ────────────── 유틸 ──────────────

def _calc_countdown(task: dict) -> str | None:
    """24시간 카운트다운 잔여 시간 계산."""
    if task.get("status") == "최초 노출" and task.get("verified_at"):
        try:
            verify_time = datetime.fromisoformat(task["verified_at"])
            remaining = verify_time - datetime.now()
            if remaining.total_seconds() > 0:
                hours, rem = divmod(int(remaining.total_seconds()), 3600)
                minutes = rem // 60
                return f"{hours}시간 {minutes}분"
            return "만료됨"
        except Exception:
            pass
    return None
