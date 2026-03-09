"use client";

import { useEffect, useState } from "react";
import { subscribeToJob } from "@/lib/api";

interface JobProgress {
  jobId: string;
  taskId: number;
  status: string;
  progress: number;
  message: string;
}

interface Props {
  jobs: { jobId: string; taskId: number }[];
  onJobComplete: (taskId: number) => void;
}

export default function ProgressOverlay({ jobs, onJobComplete }: Props) {
  const [progresses, setProgresses] = useState<Map<string, JobProgress>>(new Map());

  useEffect(() => {
    const sources: EventSource[] = [];

    jobs.forEach(({ jobId, taskId }) => {
      if (progresses.has(jobId)) return; // 이미 구독 중

      // 초기 상태 설정
      setProgresses((prev) =>
        new Map(prev).set(jobId, {
          jobId,
          taskId,
          status: "CHECKING",
          progress: 0,
          message: "연결 중...",
        })
      );

      const es = subscribeToJob(
        jobId,
        (data) => {
          setProgresses((prev) =>
            new Map(prev).set(jobId, {
              jobId,
              taskId: data.task_id,
              status: data.status,
              progress: data.progress,
              message: data.message,
            })
          );
        },
        () => {
          // 완료
          setTimeout(() => {
            setProgresses((prev) => {
              const next = new Map(prev);
              next.delete(jobId);
              return next;
            });
            onJobComplete(taskId);
          }, 2000); // 2초 후 제거
        }
      );

      sources.push(es);
    });

    return () => {
      sources.forEach((es) => es.close());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

  const items = Array.from(progresses.values());
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
            <span className="text-xs font-medium text-white">
              Task #{item.taskId} 검사 중
            </span>
            <span
              className="text-xs px-2 py-0.5 rounded"
              style={{
                background: item.status === "EXPOSED" ? "#05221620" : "#1e1e3a",
                color: item.status === "EXPOSED" ? "#10b981" : "#a5b4fc",
              }}
            >
              {item.status}
            </span>
          </div>

          {/* 진행률 바 */}
          <div
            className="w-full h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--border)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${item.progress}%`,
                background:
                  item.status === "EXPOSED"
                    ? "var(--success)"
                    : item.status === "NOT_EXPOSED"
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
