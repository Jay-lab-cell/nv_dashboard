"use client";

import { useState } from "react";
import { Task, KeywordStatus, tasksApi, exposureApi } from "@/lib/api";

interface Props {
  tasks: Task[];
  filterStatus: string;
  onCheckStart: (jobId: string, taskId: number) => void;
  onStatusChange: (taskId: number, newStatus: KeywordStatus) => void;
  onDelete: (taskId: number) => void;
}

const STATUS_LABEL: Record<string, string> = {
  ALL: "전체",
  WAITING: "대기",
  CHECKING: "노출확인",
  EXPOSED: "성공",
  REPOST_NEEDED: "미노출AS",
  NOT_EXPOSED: "미노출(검색결과없음)",
  PAID: "정산완료",
};

const STATUS_COLOR: Record<string, string> = {
  WAITING: "#6084F7",
  CHECKING: "#F59E0B",
  EXPOSED: "#8B5CF6", // 최초 노출 등
  REPOST_NEEDED: "#EF4444",
  NOT_EXPOSED: "#8B93A6",
  PAID: "#10B981",
};

const STATUS_BG: Record<string, string> = {
  WAITING: "#1B223B",
  CHECKING: "#2A231F",
  EXPOSED: "#251D3D",
  REPOST_NEEDED: "#2D1A1E",
  NOT_EXPOSED: "transparent",
  PAID: "#112D23",
};

export default function TaskTable({
  tasks,
  filterStatus,
  onCheckStart,
  onStatusChange,
  onDelete,
}: Props) {
  const [localFilter, setLocalFilter] = useState("ALL");
  const [checkingIds, setCheckingIds] = useState<Set<number>>(new Set());

  // 필터 적용
  const filtered = tasks.filter((t) => {
    const parentMatch =
      filterStatus === "total" || filterStatus === "" || t.status === filterStatus;
    const localMatch = localFilter === "ALL" || t.status === localFilter;
    return parentMatch && localMatch;
  });

  const handleCheck = async (task: Task) => {
    setCheckingIds((s) => new Set(s).add(task.id));
    try {
      const job = await exposureApi.check(task.id);
      onCheckStart(job.job_id, task.id);
      onStatusChange(task.id, "CHECKING");
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "검사 요청 실패");
    } finally {
      setCheckingIds((s) => {
        const next = new Set(s);
        next.delete(task.id);
        return next;
      });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("태스크를 삭제하시겠습니까?")) return;
    try {
      await tasksApi.delete(id);
      onDelete(id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "#1C1E2B" }}>
      {/* 헤더 및 필터 */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div className="flex items-center gap-2">
          <span className="text-xl">📋</span>
          <span className="font-bold text-white text-lg">모니터링 태스크</span>
          <span
            className="ml-2 px-2.5 py-0.5 rounded-full text-sm font-bold"
            style={{ background: "#25283A", color: "#8B5CF6" }}
          >
            {tasks.length}
          </span>
        </div>

        <div className="flex gap-2">
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLocalFilter(key)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors border ${localFilter === key
                  ? "border-[#8B5CF6] text-white"
                  : "border-transparent text-[#8B93A6] hover:text-white"
                }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 테이블 */}
      <div className="overflow-x-auto px-2">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: `1px solid #2D3142` }}>
              {["등록일", "키워드", "브랜드명", "담당자", "업체", "상태", "최초/현재순위", "24H 예정", "링크", "액션"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap"
                    style={{ color: "#8B93A6" }}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} className="text-center py-16" style={{ color: "var(--muted)" }}>
                  등록된 태스크가 없습니다.
                </td>
              </tr>
            ) : (
              filtered.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  isChecking={checkingIds.has(task.id)}
                  onCheck={() => handleCheck(task)}
                  onDelete={() => handleDelete(task.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  isChecking,
  onCheck,
  onDelete,
}: {
  task: Task;
  isChecking: boolean;
  onCheck: () => void;
  onDelete: () => void;
}) {
  const color = STATUS_COLOR[task.status] || STATUS_COLOR.NOT_EXPOSED;
  const bg = STATUS_BG[task.status] || STATUS_BG.NOT_EXPOSED;
  const label = STATUS_LABEL[task.status] || task.status;

  return (
    <tr
      className="border-b hover:bg-white/5 transition-colors"
      style={{ borderColor: "#2D3142" }}
    >
      <td className="px-4 py-5 text-sm whitespace-nowrap" style={{ color: "#A0A5B5" }}>
        {task.created_at
          ? new Date(task.created_at).toLocaleString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })
          : "-"}
      </td>
      <td className="px-4 py-5 text-white font-bold whitespace-nowrap">
        {task.keyword}
      </td>
      <td className="px-4 py-5 font-bold" style={{ color: "#10B981" }}>
        {task.brand_name}
      </td>
      <td className="px-4 py-5 font-medium" style={{ color: "#A0A5B5" }}>
        {task.note || "-"}
      </td>
      <td className="px-4 py-5 font-medium" style={{ color: "#A0A5B5" }}>
        {task.cafe_name}
      </td>
      <td className="px-4 py-5 whitespace-nowrap">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: bg, color: color }}
        >
          {bg !== "transparent" && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
          )}
          {label}
        </div>
      </td>
      <td className="px-4 py-5 text-sm" style={{ color: "#A0A5B5" }}>
        {task.rank ? `${task.rank} / ${task.rank}` : "미노출 / 미노출"}
      </td>
      <td className="px-4 py-5 text-xs flex items-center gap-1.5 mt-5" style={{ color: "#A0A5B5" }}>
        ⏱ -
      </td>
      <td className="px-4 py-5 max-w-[150px]">
        {task.exposed_url ? (
          <a
            href={task.exposed_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm truncate block"
            style={{ color: "#6084F7" }}
          >
            {task.exposed_url}
          </a>
        ) : (
          <span style={{ color: "#8B93A6" }}>-</span>
        )}
      </td>
      <td className="px-4 py-5">
        <div className="flex gap-2">
          <button
            onClick={onCheck}
            disabled={isChecking || task.status === "CHECKING"}
            className="px-3 py-1.5 rounded-md text-xs font-medium border transition-colors disabled:opacity-40"
            style={{
              borderColor: "#333B53",
              color: "#6084F7"
            }}
          >
            순위조회
          </button>
          <button
            className="px-3 py-1.5 rounded-md text-xs font-bold"
            style={{ background: "#3E2A23", color: "#F59E0B" }}
          >
            재작업
          </button>
          <button
            onClick={onDelete}
            className="px-2.5 py-1.5 rounded-md text-xs font-bold flex items-center justify-center w-8"
            style={{ background: "#3C1F26", color: "#EF4444" }}
          >
            X
          </button>
        </div>
      </td>
    </tr>
  );
}
