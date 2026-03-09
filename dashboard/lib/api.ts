/**
 * 백엔드 API 호출 함수 모음
 * 모든 fetch는 이 모듈을 통해 집중화됩니다.
 */

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── 타입 정의 ──────────────────────────────────────────────

export type KeywordStatus =
  | "WAITING"
  | "CHECKING"
  | "EXPOSED"
  | "CONFIRMED"
  | "NOT_EXPOSED"
  | "REPOST_NEEDED"
  | "REPOST_SENT"
  | "PAID";

export interface Task {
  id: number;
  cafe_name: string;
  cafe_url: string;
  keyword: string;
  brand_name: string;
  price: number;
  note: string;
  status: KeywordStatus;
  rank: number | null;
  exposed_url: string | null;
  created_at: string;
  updated_at: string;
  checked_at: string | null;
}

export interface TaskLog {
  id: number;
  task_id: number;
  status: KeywordStatus;
  rank: number | null;
  exposed_url: string | null;
  message: string;
  created_at: string;
  cafe_name?: string;
  keyword?: string;
}

export interface TaskCreatePayload {
  cafe_name: string;
  cafe_url: string;
  keywords: string;
  brand_name: string;
  price?: number;
  note?: string;
}

export interface TaskUpdatePayload {
  cafe_name?: string;
  cafe_url?: string;
  brand_name?: string;
  price?: number;
  note?: string;
  status?: KeywordStatus;
}

export interface Summary {
  total: number;
  WAITING: number;
  CHECKING: number;
  EXPOSED: number;
  CONFIRMED: number;
  NOT_EXPOSED: number;
  REPOST_NEEDED: number;
  REPOST_SENT: number;
  PAID: number;
}

export interface CheckJob {
  job_id: string;
  task_id: number;
  status: string;
  keyword?: string;
}

export interface SchedulerStatus {
  running: boolean;
  enabled: boolean;
  jobs: Array<{ id: string; name: string; next_run: string | null }>;
}

// ── 공통 fetch 래퍼 ────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `API 오류: ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

// ── 태스크 API ─────────────────────────────────────────────

export const tasksApi = {
  /** 태스크 목록 조회 */
  list: (params?: { status?: string; cafe_name?: string }) => {
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    return apiFetch<Task[]>(`/api/tasks${qs ? `?${qs}` : ""}`);
  },

  /** 태스크 단건 조회 */
  get: (id: number) => apiFetch<Task>(`/api/tasks/${id}`),

  /** 태스크 생성 (다중 키워드 지원) */
  create: (payload: TaskCreatePayload) =>
    apiFetch<Task[]>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  /** 태스크 수정 */
  update: (id: number, payload: TaskUpdatePayload) =>
    apiFetch<Task>(`/api/tasks/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  /** 태스크 삭제 */
  delete: (id: number) =>
    apiFetch<void>(`/api/tasks/${id}`, { method: "DELETE" }),

  /** 상태별 요약 통계 */
  summary: () => apiFetch<Summary>("/api/tasks/stats/summary"),
};

// ── 로그 API ───────────────────────────────────────────────

export const logsApi = {
  /** 특정 태스크 로그 조회 */
  byTask: (taskId: number, limit = 50) =>
    apiFetch<TaskLog[]>(`/api/logs?task_id=${taskId}&limit=${limit}`),

  /** 전체 최근 로그 */
  recent: (limit = 100) =>
    apiFetch<TaskLog[]>(`/api/logs/recent?limit=${limit}`),
};

// ── 노출 검사 API ──────────────────────────────────────────

export const exposureApi = {
  /** 단일 태스크 검사 트리거 → job_id 반환 */
  check: (taskId: number) =>
    apiFetch<CheckJob>(`/api/check-exposure/${taskId}`, { method: "POST" }),

  /** 일괄 검사 → job 목록 반환 */
  batchCheck: () =>
    apiFetch<{ message: string; jobs: CheckJob[] }>("/api/check-exposure/batch", {
      method: "POST",
    }),
};

// ── 스케줄러 API ───────────────────────────────────────────

export const schedulerApi = {
  /** 스케줄러 상태 조회 */
  status: () => apiFetch<SchedulerStatus>("/api/scheduler/status"),

  /** 스케줄러 ON/OFF 토글 */
  toggle: () =>
    apiFetch<{ status: string; message: string }>("/api/scheduler/toggle", {
      method: "POST",
    }),

  /** 즉시 전체 검사 실행 */
  runNow: () =>
    apiFetch<{ message: string }>("/api/scheduler/run-now", { method: "POST" }),
};

// ── SSE 유틸 ──────────────────────────────────────────────

/**
 * SSE 연결 생성 및 이벤트 구독
 * @param jobId - 구독할 job ID
 * @param onProgress - 진행 이벤트 콜백
 * @param onDone - 완료 콜백
 * @returns EventSource 인스턴스 (close()로 연결 해제)
 */
export function subscribeToJob(
  jobId: string,
  onProgress: (data: {
    task_id: number;
    status: string;
    progress: number;
    message: string;
  }) => void,
  onDone: () => void
): EventSource {
  const es = new EventSource(`${BASE_URL}/api/events/${jobId}`);

  es.addEventListener("progress", (e) => {
    const data = JSON.parse(e.data);
    onProgress(data);
  });

  es.addEventListener("done", () => {
    onDone();
    es.close();
  });

  es.addEventListener("error", () => {
    es.close();
  });

  return es;
}
