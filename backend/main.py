"""
N_Mornitoring v3 - FastAPI 백엔드
v2 Next.js의 모든 API 기능을 Python으로 재구현.
폴링 방식 → SSE(Server-Sent Events)로 교체.
"""

import uuid
import asyncio
import json
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from loguru import logger

from database import (
    init_db, get_all_tasks, get_task, create_task, update_task,
    delete_task, add_log, get_logs,
)
import re as _re
from crawler import check_keyword_exposure


def _extract_article_id(url: str) -> str | None:
    """URL에서 게시글 번호(마지막 숫자 세그먼트) 추출."""
    if not url:
        return None
    clean = url.split("?")[0]
    parts = [p for p in clean.split("/") if p]
    return parts[-1] if parts and parts[-1].isdigit() else None
from scheduler import start_scheduler, stop_scheduler
from models import TaskCreate, TaskUpdate


# ────────────── Job Store (in-memory) ──────────────
# key: job_id, value: { status, result, error, created_at }
_jobs: dict[str, dict] = {}

def _create_job(task_id: str, job_type: str) -> str:
    job_id = str(uuid.uuid4())
    _jobs[job_id] = {
        "id": job_id,
        "task_id": task_id,
        "type": job_type,
        "status": "pending",
        "result": None,
        "error": None,
        "created_at": time.time(),
    }
    return job_id

def _update_job(job_id: str, updates: dict):
    if job_id in _jobs:
        _jobs[job_id].update(updates)

def _get_job(job_id: str) -> dict | None:
    return _jobs.get(job_id)

def _clean_old_jobs():
    """30분 이상 경과한 완료 job 삭제."""
    cutoff = time.time() - 1800
    to_delete = [
        jid for jid, job in _jobs.items()
        if job["status"] in ("done", "error") and job["created_at"] < cutoff
    ]
    for jid in to_delete:
        del _jobs[jid]


# ────────────── App Lifecycle ──────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    start_scheduler()
    logger.info("N_Mornitoring v3 백엔드 시작 (port 8000)")
    yield
    stop_scheduler()
    logger.info("백엔드 종료")


app = FastAPI(title="N_Mornitoring v3", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:9000", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ────────────── Tasks CRUD ──────────────

@app.get("/api/tasks")
async def list_tasks():
    tasks = await get_all_tasks()
    return {"success": True, "data": tasks}


@app.post("/api/tasks")
async def create_tasks(body: TaskCreate):
    keyword_list = [k.strip() for k in body.keywords.split("\n") if k.strip()]
    if not keyword_list:
        raise HTTPException(400, "유효한 키워드가 없습니다.")
    if len(keyword_list) > 50:
        raise HTTPException(400, "키워드는 최대 50개까지 등록 가능합니다.")

    now = datetime.now().isoformat()
    created = []

    for keyword in keyword_list:
        task = {
            "id": str(uuid.uuid4()),
            "keyword": keyword,
            "brand": body.brand,
            "manager": body.manager,
            "company": body.company,
            "status": "대기",
            "initial_rank": "",
            "current_rank": "",
            "amount": body.amount or "",
            "url": "",
            "initial_url": "",
            "created_at": now,
            "verified_at": "",
            "updated_at": now,
        }
        await create_task(task)
        await add_log({
            "id": str(uuid.uuid4()),
            "task_id": task["id"],
            "prev_status": "",
            "new_status": "대기",
            "changed_by": "SYSTEM",
            "message": "태스크 등록",
            "created_at": now,
        })
        created.append(task)

    return {
        "success": True,
        "data": created,
        "message": f"{len(created)}개 키워드가 등록되었습니다.",
    }


@app.put("/api/tasks")
async def update_task_route(body: dict):
    # 프론트엔드는 camelCase(taskId, changedBy)로 전송
    task_id = body.get("taskId") or body.get("task_id")
    updates = body.get("updates", {})
    changed_by = body.get("changedBy") or body.get("changed_by", "USER")

    if not task_id:
        raise HTTPException(400, "taskId가 필요합니다.")

    task = await get_task(task_id)
    if not task:
        raise HTTPException(404, "해당 태스크를 찾을 수 없습니다.")

    prev_status = task["status"]
    updates = dict(updates)
    now = datetime.now().isoformat()

    # '최초 노출'로 변경 시 24시간 후 검증 예약
    if updates.get("status") == "최초 노출":
        verify_time = (datetime.now() + timedelta(hours=24)).isoformat()
        updates["verified_at"] = verify_time

    await update_task(task_id, updates)

    # 상태 변경 시 로그 자동 기록
    new_status = updates.get("status")
    if new_status and new_status != prev_status:
        log_message = _build_log_message(new_status, updates)
        await add_log({
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "prev_status": prev_status,
            "new_status": new_status,
            "changed_by": changed_by,
            "message": log_message,
            "created_at": now,
        })

    return {"success": True, "message": "태스크가 업데이트되었습니다."}


@app.delete("/api/tasks")
async def delete_task_route(taskId: str = Query(...)):
    task = await get_task(taskId)
    if not task:
        raise HTTPException(404, "해당 태스크를 찾을 수 없습니다.")
    await delete_task(taskId)
    return {"success": True, "message": "태스크가 삭제되었습니다."}


# ────────────── Logs ──────────────

@app.get("/api/logs")
async def get_task_logs(taskId: str = Query(...)):
    logs = await get_logs(taskId)
    return {"success": True, "data": logs}


# ────────────── 최초 노출확인 (SSE) ──────────────

@app.post("/api/check-exposure")
async def start_check_exposure(body: dict):
    task_id = body.get("taskId")
    if not task_id:
        raise HTTPException(400, "taskId가 필요합니다.")

    task = await get_task(task_id)
    if not task:
        raise HTTPException(404, "해당 태스크를 찾을 수 없습니다.")

    if task["status"] not in ("대기", "미노출"):
        raise HTTPException(
            400, f"현재 상태({task['status']})에서는 최초 노출확인을 실행할 수 없습니다."
        )

    _clean_old_jobs()
    job_id = _create_job(task_id, "check-exposure")

    asyncio.create_task(_run_check_exposure(job_id, task))

    return {"success": True, "jobId": job_id}


async def _run_check_exposure(job_id: str, task: dict):
    _update_job(job_id, {"status": "running"})
    task_id = task["id"]
    now = datetime.now().isoformat()
    try:
        logger.info("최초 노출확인 시작: {} / {}", task["keyword"], task["brand"])
        result = await check_keyword_exposure(task["keyword"], task["brand"])

        if result["found"]:
            verify_time = (datetime.now() + timedelta(hours=24)).isoformat()
            await update_task(task_id, {
                "status": "최초 노출",
                "initial_rank": str(result["rank"]),
                "current_rank": str(result["rank"]),
                "url": result["url"],
                "initial_url": result["url"],
                "verified_at": verify_time,
            })
            await add_log({
                "id": str(uuid.uuid4()),
                "task_id": task_id,
                "prev_status": task["status"],
                "new_status": "최초 노출",
                "changed_by": "CRAWLER",
                "message": f"[최초노출] 순위 {result['rank']}, URL: {result['url']}",
                "created_at": now,
            })
        else:
            await update_task(task_id, {
                "status": "미노출",
                "initial_rank": "미노출",
                "current_rank": "미노출",
                "url": "",
            })
            await add_log({
                "id": str(uuid.uuid4()),
                "task_id": task_id,
                "prev_status": task["status"],
                "new_status": "미노출",
                "changed_by": "CRAWLER",
                "message": "[최초노출] 순위 미발견",
                "created_at": now,
            })

        _update_job(job_id, {"status": "done", "result": result})

    except Exception as e:
        logger.error("check-exposure 오류: {}", e)
        _update_job(job_id, {"status": "error", "error": str(e)})


# ────────────── 현재 순위 확인 (SSE) ──────────────

@app.post("/api/check-current-rank")
async def start_check_rank(body: dict):
    task_id = body.get("taskId")
    if not task_id:
        raise HTTPException(400, "taskId가 필요합니다.")

    task = await get_task(task_id)
    if not task:
        raise HTTPException(404, "해당 태스크를 찾을 수 없습니다.")

    _clean_old_jobs()
    job_id = _create_job(task_id, "check-rank")

    asyncio.create_task(_run_check_rank(job_id, task))

    return {"success": True, "jobId": job_id}


async def _run_check_rank(job_id: str, task: dict):
    _update_job(job_id, {"status": "running"})
    task_id = task["id"]
    now = datetime.now().isoformat()
    try:
        result = await check_keyword_exposure(task["keyword"], task["brand"])
        new_status = task["status"]
        log_message = ""
        
        if result["found"]:
            if task["status"] == "미노출":
                # 미노출 상태에서 노출된 경우 -> 최초 노출로 승격
                verify_time = (datetime.now() + timedelta(hours=24)).isoformat()
                new_status = "최초 노출"
                rank_display = str(result['rank'])
                await update_task(task_id, {
                    "status": new_status,
                    "initial_rank": rank_display,
                    "current_rank": rank_display,
                    "url": result["url"],
                    "initial_url": result["url"],
                    "verified_at": verify_time,
                })
                log_message = f"[상태변경] 미노출 -> 최초 노출 전환 (순위: {rank_display}, URL: {result['url']})"
            else:
                new_id = _extract_article_id(result["url"])
                old_id = _extract_article_id(task.get("initial_url") or task.get("url"))
                if new_id and old_id:
                    suffix = "(유지중)" if new_id == old_id else "(URL바뀜)"
                else:
                    suffix = ""
                rank_display = f"{result['rank']}{suffix}"
                await update_task(task_id, {"current_rank": rank_display, "url": result["url"]})
                log_message = f"[순위확인] {result['message']}{(' ' + suffix) if suffix else ''}"
        else:
            rank_display = "미노출"
            await update_task(task_id, {"current_rank": rank_display})
            log_message = f"[순위확인] {result['message']}"

        await add_log({
            "id": str(uuid.uuid4()),
            "task_id": task_id,
            "prev_status": task["status"],
            "new_status": new_status,
            "changed_by": "CRAWLER",
            "message": log_message,
            "created_at": now,
        })
        _update_job(job_id, {"status": "done", "result": result})
    except Exception as e:
        _update_job(job_id, {"status": "error", "error": str(e)})


# ────────────── SSE 스트림 ──────────────

@app.get("/api/events/{job_id}")
async def stream_job_events(job_id: str):
    """
    SSE 스트림 — 크롤링 완료 시 이벤트 push.
    폴링(1초마다 GET) 대신 이 엔드포인트 하나로 대체.
    """
    async def generator():
        max_wait = 120  # 최대 2분 대기
        elapsed = 0
        while elapsed < max_wait:
            job = _get_job(job_id)
            if not job:
                yield {"data": json.dumps({"status": "error", "error": "job not found"})}
                break

            yield {"data": json.dumps({
                "status": job["status"],
                "result": job.get("result"),
                "error": job.get("error"),
            })}

            if job["status"] in ("done", "error"):
                break

            await asyncio.sleep(0.5)
            elapsed += 0.5

    return EventSourceResponse(generator())


# ────────────── 수동 배치 검증 ──────────────

@app.post("/api/verify")
async def start_batch_verify():
    """수동으로 24시간 검증 배치 실행."""
    from database import get_tasks_ready_for_24h_verify
    from scheduler import run_24h_verification

    _clean_old_jobs()
    job_id = _create_job("batch", "verify")
    asyncio.create_task(_run_batch_verify(job_id))
    return {"success": True, "jobId": job_id, "message": "배치 검증을 시작했습니다."}


async def _run_batch_verify(job_id: str):
    from scheduler import run_24h_verification
    _update_job(job_id, {"status": "running"})
    try:
        await run_24h_verification()
        _update_job(job_id, {"status": "done", "result": {"message": "배치 검증 완료"}})
    except Exception as e:
        _update_job(job_id, {"status": "error", "error": str(e)})


# ────────────── 스케줄러 상태 확인 ──────────────

@app.post("/api/scheduler")
async def scheduler_check(body: dict):
    """프론트엔드 자동 검증 체크 — 검증 대상 태스크 수 반환."""
    from database import get_tasks_ready_for_24h_verify
    targets = await get_tasks_ready_for_24h_verify()
    return {"success": True, "pendingCount": len(targets)}


# ────────────── 유틸 ──────────────

def _build_log_message(status: str, updates: dict) -> str:
    msg_map = {
        "대기": "[재작업] 상태 초기화 및 재작업 요청",
        "최초 노출": f"[최초노출] 순위 {updates.get('initial_rank', '-')}, URL: {updates.get('url', '-')}",
        "건바이 성공": "[24H 검증] 카페 댓글에서 브랜드 노출 유지 확인 → 건바이 성공",
        "미노출 AS": "[24H 검증] 카페 댓글에서 브랜드 미발견 → 미노출 AS",
        "판단불가": "[24H 검증] 게시글 접근 불가 또는 판단 불가",
        "정산 대기": "[정산 이관] 건바이 성공 건 → 정산 대기로 이관",
        "입금 완료": "[입금 완료] 정산 처리 완료",
    }
    return msg_map.get(status, f"상태 변경: {status}")
