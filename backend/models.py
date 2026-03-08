"""
데이터 모델 정의 (Pydantic + Enum)
v2 한국어 상태값 체계를 유지하면서 타입 안전성 확보.
"""

from enum import Enum
from typing import Optional
from pydantic import BaseModel


class TaskStatus(str, Enum):
    WAITING = "대기"
    FIRST_EXPOSED = "최초 노출"
    NOT_EXPOSED = "미노출"
    SUCCESS_24H = "건바이 성공"
    AS_NEEDED = "미노출 AS"
    UNCLEAR = "판단불가"
    SETTLEMENT_WAIT = "정산 대기"
    PAID = "입금 완료"


class TaskCreate(BaseModel):
    keywords: str          # 줄바꿈으로 구분된 키워드 목록
    brand: str
    manager: str
    company: str
    amount: Optional[str] = ""


class TaskUpdate(BaseModel):
    task_id: str
    updates: dict
    changed_by: Optional[str] = "USER"


class TaskResponse(BaseModel):
    id: str
    keyword: str
    brand: str
    manager: str
    company: str
    status: str
    initial_rank: Optional[str] = ""
    current_rank: Optional[str] = ""
    amount: Optional[str] = ""
    url: Optional[str] = ""
    initial_url: Optional[str] = ""
    created_at: str
    verified_at: Optional[str] = ""
    updated_at: str


class LogEntry(BaseModel):
    id: str
    task_id: str
    prev_status: Optional[str] = ""
    new_status: str
    changed_by: str
    message: Optional[str] = ""
    created_at: str


class JobStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    ERROR = "error"


class CrawlResult(BaseModel):
    found: bool
    rank: Optional[str] = None
    total_posts: int = 0
    url: Optional[str] = None
    message: str = ""
    details: list = []
