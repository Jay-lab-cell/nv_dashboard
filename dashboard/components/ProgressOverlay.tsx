"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const sources: EventSource[] = [];

    jobs.forEach(({ jobId, taskId }) => {
      if (infos.has(jobId)) return;

      setInfos((prev) =>
        new Map(prev).set(jobId, {
          jobId,
          taskId,
          status: "running",
          message: "크롤링 진행 중...",
        })
      );

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
          setTimeout(() => {
            setInfos((prev) => {
              const next = new Map(prev);
              next.delete(jobId);
              return next;
            });
            onJobComplete(taskId);
          }, 2000);
        }
      );

      sources.push(es);
    });

    return () => {
      sources.forEach((es) => es.close());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs]);

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
