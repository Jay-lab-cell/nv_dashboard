"use client";

import { useState } from "react";
import { Task, TaskStatus, tasksApi, exposureApi } from "@/lib/api";

interface Props {
  tasks: Task[];
  filterStatus: string;
  onCheckStart: (jobId: string, taskId: string) => void;
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void;
  onDelete: (taskId: string) => void;
}

const STATUS_LABEL: Record<string, string> = {
  ALL: "전체",
  "대기": "대기",
  CHECKING: "노출확인",
  "최초 노출": "최초 노출",
  "건바이 성공": "건바이 성공",
  "미노출": "미노출",
  "미노출 AS": "미노출 AS",
  "판단불가": "판단불가",
  "정산 대기": "정산 대기",
  "입금 완료": "입금 완료",
};

const STATUS_COLOR: Record<string, string> = {
  "대기": "#6084F7",
  CHECKING: "#F59E0B",
  "최초 노출": "#8B5CF6",
  "건바이 성공": "#10B981",
  "미노출": "#8B93A6",
  "미노출 AS": "#EF4444",
  "판단불가": "#F59E0B",
  "정산 대기": "#6084F7",
  "입금 완료": "#10B981",
};

const STATUS_BG: Record<string, string> = {
  "대기": "#1B223B",
  CHECKING: "#2A231F",
  "최초 노출": "#251D3D",
  "건바이 성공": "#112D23",
  "미노출": "transparent",
  "미노출 AS": "#2D1A1E",
  "판단불가": "#2A231F",
  "정산 대기": "#1B223B",
  "입금 완료": "#112D23",
};

export default function TaskTable({
  tasks,
  filterStatus,
  onCheckStart,
  onStatusChange,
  onDelete,
}: Props) {
  const [localFilter, setLocalFilter] = useState("ALL");
  const [checkingIds, setCheckingIds] = useState<Set<string>>(new Set());

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
      let job;
      if (task.status === "대기" || task.status === "미노출") {
        job = await exposureApi.check(task.id);
      } else {
        job = await exposureApi.checkRank(task.id);
      }
      onCheckStart(job.jobId, task.id);
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

  const handleDelete = async (id: string) => {
    if (!confirm("태스크를 삭제하시겠습니까?")) return;
    try {
      await tasksApi.delete(id);
      onDelete(id);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "삭제 실패");
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#1C1E2B" }}
    >
      {/* 헤더 및 필터 */}
      <div className="flex items-center justify-between p-6 pb-4">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white text-lg">모니터링 태스크</span>
          <span
            className="ml-2 px-2.5 py-0.5 rounded-full text-sm font-bold"
            style={{ background: "#25283A", color: "#8B5CF6" }}
          >
            {tasks.length}
          </span>
        </div>

        <div className="flex gap-2 flex-wrap">
          {Object.entries(STATUS_LABEL).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setLocalFilter(key)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors border ${
                localFilter === key
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
            <tr style={{ borderBottom: "1px solid #2D3142" }}>
              {[
                "등록일",
                "키워드",
                "브랜드명",
                "담당자",
                "업체",
                "상태",
                "최초/현재순위",
                "24H 예정",
                "링크",
                "액션",
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-4 text-left text-xs font-semibold whitespace-nowrap"
                  style={{ color: "#8B93A6" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={10}
                  className="text-center py-16"
                  style={{ color: "var(--muted)" }}
                >
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
  const color = STATUS_COLOR[task.status] || STATUS_COLOR["미노출"];
  const bg = STATUS_BG[task.status] || STATUS_BG["미노출"];
  const label = STATUS_LABEL[task.status] || task.status;

  const rankDisplay =
    task.initial_rank && task.current_rank
      ? `${task.initial_rank} / ${task.current_rank}`
      : task.initial_rank || task.current_rank || "-";

  return (
    <tr
      className="border-b hover:bg-white/5 transition-colors"
      style={{ borderColor: "#2D3142" }}
    >
      <td
        className="px-4 py-5 text-sm whitespace-nowrap"
        style={{ color: "#A0A5B5" }}
      >
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
        {task.brand}
      </td>
      <td className="px-4 py-5 font-medium" style={{ color: "#A0A5B5" }}>
        {task.manager || "-"}
      </td>
      <td className="px-4 py-5 font-medium" style={{ color: "#A0A5B5" }}>
        {task.company || "-"}
      </td>
      <td className="px-4 py-5 whitespace-nowrap">
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ background: bg, color: color }}
        >
          {bg !== "transparent" && (
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: color }}
            />
          )}
          {label}
        </div>
      </td>
      <td className="px-4 py-5 text-sm" style={{ color: "#A0A5B5" }}>
        {rankDisplay}
      </td>
      <td
        className="px-4 py-5 text-xs"
        style={{ color: "#A0A5B5" }}
      >
        {task.countdown_remaining || "-"}
      </td>
      <td className="px-4 py-5 max-w-[150px]">
        {task.url ? (
          <a
            href={task.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm truncate block"
            style={{ color: "#6084F7" }}
          >
            {task.url}
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
              color: "#6084F7",
            }}
          >
            순위조회
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
