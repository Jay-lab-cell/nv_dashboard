/**
 * 백엔드 API 호출 함수 모음
 * 모든 fetch는 이 모듈을 통해 집중화됩니다.
 */

// next.config.mjs rewrites를 통해 /api/* → 백엔드로 프록시됨
const BASE_URL = "";

// ── 타입 정의 ──────────────────────────────────────────────

export type TaskStatus =
  | "대기"
  | "최초 노출"
  | "미노출"
  | "건바이 성공"
  | "미노출 AS"
  | "판단불가"
  | "정산 대기"
  | "입금 완료"
  | "CHECKING"; // 프론트엔드 전용: 크롤링 진행 중 표시

export interface Task {
  id: string;
  keyword: string;
  brand: string;
  manager: string;
  company: string;
  status: TaskStatus;
  initial_rank: string;
  current_rank: string;
  amount: string;
  url: string;
  initial_url: string;
  created_at: string;
  verified_at: string;
  updated_at: string;
  countdown_remaining?: string | null;
}

export interface TaskCreatePayload {
  keywords: string;
  brand: string;
  manager: string;
  company: string;
  amount?: string;
}

export interface Summary {
  total: number;
  [status: string]: number;
}

// ── 공통 fetch 래퍼 ────────────────────────────────────────

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  jobId?: string;
}

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

  if (res.status === 204) return undefined as T;

  return res.json();
}

// ── 태스크 API ─────────────────────────────────────────────

export const tasksApi = {
  /** 태스크 목록 조회 */
  list: async (): Promise<Task[]> => {
    const res = await apiFetch<ApiResponse<Task[]>>("/api/tasks");
    return res.data || [];
  },

  /** 태스크 단건 조회 */
  get: async (id: string): Promise<Task> => {
    const tasks = await tasksApi.list();
    const task = tasks.find((t) => t.id === id);
    if (!task) throw new Error("태스크를 찾을 수 없습니다.");
    return task;
  },

  /** 태스크 생성 (다중 키워드 지원) */
  create: async (payload: TaskCreatePayload): Promise<Task[]> => {
    const res = await apiFetch<ApiResponse<Task[]>>("/api/tasks", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return res.data || [];
  },

  /** 태스크 수정 */
  update: async (
    taskId: string,
    updates: Record<string, string>,
    changedBy = "USER"
  ): Promise<void> => {
    await apiFetch<ApiResponse>("/api/tasks", {
      method: "PUT",
      body: JSON.stringify({ taskId, updates, changedBy }),
    });
  },

  /** 태스크 삭제 */
  delete: async (taskId: string): Promise<void> => {
    await apiFetch<ApiResponse>(
      `/api/tasks?taskId=${encodeURIComponent(taskId)}`,
      { method: "DELETE" }
    );
  },

  /** 상태별 요약 통계 (클라이언트 계산) */
  summary: async (): Promise<Summary> => {
    const tasks = await tasksApi.list();
    const summary: Summary = { total: tasks.length };
    for (const task of tasks) {
      summary[task.status] = (summary[task.status] || 0) + 1;
    }
    return summary;
  },
};

// ── 노출 검사 API ──────────────────────────────────────────

export const exposureApi = {
  /** 최초 노출확인 (대기/미노출 상태용) */
  check: async (taskId: string): Promise<{ jobId: string }> => {
    const res = await apiFetch<ApiResponse>("/api/check-exposure", {
      method: "POST",
      body: JSON.stringify({ taskId }),
    });
    return { jobId: res.jobId! };
  },

  /** 현재 순위 확인 (이미 노출된 상태용) */
  checkRank: async (taskId: string): Promise<{ jobId: string }> => {
    const res = await apiFetch<ApiResponse>("/api/check-current-rank", {
      method: "POST",
      body: JSON.stringify({ taskId }),
    });
    return { jobId: res.jobId! };
  },
};

// ── 로그 API ───────────────────────────────────────────────

export interface TaskLog {
  id: string;
  task_id: string;
  prev_status: string;
  new_status: string;
  changed_by: string;
  message: string;
  created_at: string;
}

export const logsApi = {
  /** 특정 태스크 로그 조회 */
  byTask: async (taskId: string): Promise<TaskLog[]> => {
    const res = await apiFetch<ApiResponse<TaskLog[]>>(
      `/api/logs?taskId=${encodeURIComponent(taskId)}`
    );
    return res.data || [];
  },
};

// ── SSE 유틸 ──────────────────────────────────────────────

export function subscribeToJob(
  jobId: string,
  onUpdate: (data: {
    status: string;
    result?: Record<string, unknown>;
    error?: string;
  }) => void,
  onDone: () => void
): EventSource {
  const es = new EventSource(`${BASE_URL}/api/events/${jobId}`);

  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      onUpdate(data);

      if (data.status === "done" || data.status === "error") {
        onDone();
        es.close();
      }
    } catch {
      // ignore parse errors
    }
  };

  es.onerror = () => {
    es.close();
  };

  return es;
}
