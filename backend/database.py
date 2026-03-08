"""
SQLite 데이터베이스 관리 모듈 (v1 기반 + v2 스키마 확장)
aiosqlite로 FastAPI 비동기 이벤트 루프와 완벽 통합.
"""

import os
import aiosqlite
from datetime import datetime, timedelta
from loguru import logger

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "monitor.db")


async def init_db():
    """데이터베이스 초기화 및 테이블 생성."""
    async with aiosqlite.connect(DB_PATH) as db:
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
        # 마이그레이션: 기존 테이블에 컬럼 추가 (있으면 무시)
        extra_cols = [
            ("tasks", "manager", "TEXT DEFAULT ''"),
            ("tasks", "company", "TEXT DEFAULT ''"),
            ("tasks", "amount", "TEXT DEFAULT ''"),
            ("tasks", "initial_url", "TEXT DEFAULT ''"),
            ("tasks", "verified_at", "TEXT DEFAULT ''"),
        ]
        for table, col, col_def in extra_cols:
            try:
                await db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {col_def}")
            except Exception:
                pass
        await db.commit()
    logger.info("DB 초기화 완료: {}", DB_PATH)


# ────────────── Tasks ──────────────

async def get_all_tasks() -> list[dict]:
    """전체 태스크 조회 (최신 등록순)."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM tasks ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        results = []
        for row in rows:
            d = dict(row)
            d["countdown_remaining"] = _calc_countdown(d)
            results.append(d)
        return results


async def get_task(task_id: str) -> dict | None:
    """특정 태스크 조회."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
        row = await cursor.fetchone()
        return dict(row) if row else None


async def create_task(task: dict) -> dict:
    """태스크 생성."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO tasks
               (id, keyword, brand, manager, company, status,
                initial_rank, current_rank, amount, url, initial_url,
                created_at, verified_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                task["id"], task["keyword"], task["brand"],
                task.get("manager", ""), task.get("company", ""),
                task.get("status", "대기"),
                task.get("initial_rank", ""), task.get("current_rank", ""),
                task.get("amount", ""), task.get("url", ""),
                task.get("initial_url", ""),
                task["created_at"], task.get("verified_at", ""),
                task["updated_at"],
            )
        )
        await db.commit()
    return task


async def update_task(task_id: str, updates: dict) -> bool:
    """태스크 필드 업데이트."""
    if not updates:
        return False
    updates["updated_at"] = datetime.now().isoformat()
    sets = ", ".join(f"{k} = ?" for k in updates)
    vals = list(updates.values()) + [task_id]
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(f"UPDATE tasks SET {sets} WHERE id = ?", vals)
        await db.commit()
    return True


async def delete_task(task_id: str) -> bool:
    """태스크 삭제 (logs CASCADE 삭제)."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
        await db.commit()
    return True


async def get_tasks_ready_for_24h_verify() -> list[dict]:
    """24시간 검증 대상 태스크 조회 (최초노출 후 24시간 경과)."""
    cutoff = datetime.now().isoformat()
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """SELECT * FROM tasks
               WHERE status = '최초 노출'
               AND verified_at != ''
               AND verified_at <= ?""",
            (cutoff,)
        )
        rows = await cursor.fetchall()
        return [dict(r) for r in rows]


# ────────────── Logs ──────────────

async def add_log(log: dict):
    """로그 추가."""
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """INSERT INTO logs
               (id, task_id, prev_status, new_status, changed_by, message, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                log["id"], log["task_id"],
                log.get("prev_status", ""), log["new_status"],
                log.get("changed_by", "SYSTEM"),
                log.get("message", ""), log["created_at"],
            )
        )
        await db.commit()


async def get_logs(task_id: str, limit: int = 50) -> list[dict]:
    """특정 태스크의 로그 조회."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM logs WHERE task_id = ? ORDER BY created_at DESC LIMIT ?",
            (task_id, limit)
        )
        rows = await cursor.fetchall()
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
