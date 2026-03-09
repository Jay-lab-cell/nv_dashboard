"use client";

import { useEffect, useRef, useState } from "react";
import { subscribeToJob } from "@/lib/api";

interface JobInfo {
  jobId: string;
  taskId: string;
  status: string;
  message: string;
}

interface Props {
  jobs: { jobId: string; taskId: string }[];
  onJobComplete: (taskId: string) => void;
}

export default function ProgressOverlay({ jobs, onJobComplete }: Props) {
  const [infos, setInfos] = useState<Map<string, JobInfo>>(new Map());
  const sourcesRef = useRef<Map<string, EventSource>>(new Map());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  /** job 완료 처리: 오버레이 제거 + 콜백 호출 */
  const completeJob = (jobId: string, taskId: string) => {
    // 기존 타이머 정리
    const timer = timersRef.current.get(jobId);
    if (timer) clearTimeout(timer);
    timersRef.current.delete(jobId);

    // EventSource 정리
    const es = sourcesRef.current.get(jobId);
    if (es) es.close();
    sourcesRef.current.delete(jobId);

    // 2초 후 오버레이 제거
    setTimeout(() => {
      setInfos((prev) => {
        const next = new Map(prev);
        next.delete(jobId);
        return next;
      });
      onJobComplete(taskId);
    }, 2000);
  };

  useEffect(() => {
    jobs.forEach(({ jobId, taskId }) => {
      if (infos.has(jobId) || sourcesRef.current.has(jobId)) return;

      setInfos((prev) =>
        new Map(prev).set(jobId, {
          jobId,
          taskId,
          status: "running",
          message: "크롤링 진행 중...",
        })
      );

      // 프론트엔드 안전장치: 90초 후 자동 종료
      const safetyTimer = setTimeout(() => {
        completeJob(jobId, taskId);
      }, 90_000);
      timersRef.current.set(jobId, safetyTimer);

      const es = subscribeToJob(
        jobId,
        (data) => {
          let message = "크롤링 진행 중...";
          if (data.status === "done") {
            const result = data.result;
            if (result?.found) {
              message = `노출 발견! 순위: ${result.rank}`;
            } else {
              message = "미노출";
            }
          } else if (data.status === "error") {
            message = `오류: ${data.error || "알 수 없는 오류"}`;
          }

          setInfos((prev) =>
            new Map(prev).set(jobId, {
              jobId,
              taskId,
              status: data.status,
              message,
            })
          );
        },
        () => {
          completeJob(jobId, taskId);
        }
      );

      sourcesRef.current.set(jobId, es);
    });

    return () => {
      sourcesRef.current.forEach((es) => es.close());
      sourcesRef.current.clear();
      timersRef.current.forEach((t) => clearTimeout(t));
      timersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  /** 수동 닫기 핸들러 */
  const handleDismiss = (jobId: string, taskId: string) => {
    completeJob(jobId, taskId);
  };

  const items = Array.from(infos.values());
  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {items.map((item) => (
        <div
          key={item.jobId}
          className="rounded-xl p-4 border shadow-xl"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--border)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-white">검사 진행 중</span>
            <div className="flex items-center gap-2">
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  background:
                    item.status === "done" ? "#05221620" : "#1e1e3a",
                  color:
                    item.status === "done" ? "#10b981" : "#a5b4fc",
                }}
              >
                {item.status === "running"
                  ? "진행 중"
                  : item.status === "done"
                  ? "완료"
                  : item.status === "error"
                  ? "오류"
                  : item.status}
              </span>
              {/* 닫기 버튼 */}
              <button
                onClick={() => handleDismiss(item.jobId, item.taskId)}
                className="text-xs px-1 py-0.5 rounded hover:bg-white/10 transition-colors"
                style={{ color: "#8B93A6" }}
                title="닫기"
              >
                ✕
              </button>
            </div>
          </div>

          {/* 진행 바 */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width:
                  item.status === "done" || item.status === "error"
                    ? "100%"
                    : "60%",
                background:
                  item.status === "done"
                    ? "var(--success)"
                    : item.status === "error"
                    ? "var(--danger)"
                    : "var(--accent)",
              }}
            />
          </div>

          <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
            {item.message}
          </p>
        </div>
      ))}
    </div>
  );
}
