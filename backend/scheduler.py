"""
APScheduler 기반 백그라운드 자동 검증 스케줄러.
매 1시간마다 '최초 노출' 후 24시간 경과 태스크를 자동 검증.
"""

import uuid
from datetime import datetime
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from loguru import logger

from database import get_tasks_ready_for_24h_verify, update_task, add_log
from crawler import check_keyword_exposure

scheduler = AsyncIOScheduler(timezone="Asia/Seoul")

_is_running = False  # 중복 실행 방지


async def run_24h_verification():
    """24시간 검증 대상 태스크 자동 배치 처리."""
    global _is_running
    if _is_running:
        logger.info("스케줄러: 이전 검증 실행 중 — 스킵")
        return

    _is_running = True
    try:
        targets = await get_tasks_ready_for_24h_verify()
        if not targets:
            logger.info("스케줄러: 검증 대상 없음")
            return

        logger.info("스케줄러: 검증 대상 {}개 처리 시작", len(targets))

        for task in targets:
            task_id = task["id"]
            keyword = task["keyword"]
            brand = task["brand"]
            now = datetime.now().isoformat()

            try:
                logger.info("  검증 중: {} / {}", keyword, brand)
                result = await check_keyword_exposure(keyword, brand)

                if result["found"]:
                    new_status = "건바이 성공"
                    msg = f"[24H 검증] 댓글 노출 유지 확인 → 건바이 성공 (순위: {result['rank']})"
                    updates = {
                        "status": new_status,
                        "current_rank": result["rank"],
                        "url": result["url"],
                    }
                else:
                    new_status = "미노출 AS"
                    msg = "[24H 검증] 댓글 미발견 → 미노출 AS"
                    updates = {"status": new_status}

                await update_task(task_id, updates)
                await add_log({
                    "id": str(uuid.uuid4()),
                    "task_id": task_id,
                    "prev_status": "최초 노출",
                    "new_status": new_status,
                    "changed_by": "SCHEDULER",
                    "message": msg,
                    "created_at": now,
                })

            except Exception as e:
                logger.error("  검증 오류 ({}): {}", keyword, e)
                await update_task(task_id, {"status": "판단불가"})
                await add_log({
                    "id": str(uuid.uuid4()),
                    "task_id": task_id,
                    "prev_status": "최초 노출",
                    "new_status": "판단불가",
                    "changed_by": "SCHEDULER",
                    "message": f"[24H 검증] 크롤링 오류: {str(e)[:60]}",
                    "created_at": now,
                })

        logger.info("스케줄러: 검증 완료")

    finally:
        _is_running = False


def start_scheduler():
    """스케줄러 시작 (FastAPI 시작 시 호출)."""
    scheduler.add_job(
        run_24h_verification,
        trigger="interval",
        hours=1,
        id="verify_24h",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("스케줄러 시작 (1시간 간격 자동 검증)")


def stop_scheduler():
    """스케줄러 중지 (FastAPI 종료 시 호출)."""
    if scheduler.running:
        scheduler.shutdown()
        logger.info("스케줄러 중지")
