"use client";

import { useEffect, useMemo, useState } from "react";
import { tasksApi, Task, TaskStatus } from "@/lib/api";

const ARCHIVE_STATUSES: TaskStatus[] = ["정산 대기", "입금 완료"];

interface GroupedByMonth {
  [month: string]: {
    [company: string]: Task[];
  };
}

export default function ArchivePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    // 전체 태스크 로드 후 정산 대기/입금 완료만 필터
    tasksApi
      .list()
      .then((all) =>
        setTasks(all.filter((t) => ARCHIVE_STATUSES.includes(t.status as TaskStatus)))
      )
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // 월별 그룹핑
  const grouped = useMemo<GroupedByMonth>(() => {
    const result: GroupedByMonth = {};

    tasks.forEach((task) => {
      const date = new Date(task.updated_at);
      const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const company = task.company || "미지정";
      if (!result[month]) result[month] = {};
      if (!result[month][company]) result[month][company] = [];
      result[month][company].push(task);
    });

    return result;
  }, [tasks]);

  const months = Object.keys(grouped).sort().reverse();

  const filteredMonths = selectedMonth === "all" ? months : [selectedMonth];

  // 총 합계 계산
  const totalAmount = tasks
    .filter((t) => t.status === "입금 완료")
    .reduce((sum, t) => sum + (parseInt(t.amount) || 0), 0);

  // 입금 완료 처리
  const handleMarkPaid = async (task: Task) => {
    setUpdatingId(task.id);
    try {
      await tasksApi.update(task.id, { status: "입금 완료" });
      setTasks((prev) =>
        prev.map((t) =>
          t.id === task.id ? { ...t, status: "입금 완료" as TaskStatus } : t
        )
      );
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "상태 변경 실패");
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">정산 아카이브</h1>
          <p className="text-sm mt-1" style={{ color: "var(--muted)" }}>
            정산 대기 및 입금 완료 태스크 현황
          </p>
        </div>

        {/* 월 필터 */}
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            월 필터:
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm outline-none border"
            style={{
              background: "var(--card-bg)",
              borderColor: "var(--border)",
              color: "white",
            }}
          >
            <option value="all">전체</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard
          label="전체 건수"
          value={`${tasks.length}건`}
          color="#7c3aed"
        />
        <StatCard
          label="입금 완료"
          value={`${tasks.filter((t) => t.status === "입금 완료").length}건`}
          color="#10b981"
        />
        <StatCard
          label="입금 완료 총액"
          value={`${totalAmount.toLocaleString()}원`}
          color="#3b82f6"
        />
      </div>

      {/* 월별 + 업체별 그룹 */}
      {filteredMonths.length === 0 ? (
        <div
          className="text-center py-20 rounded-xl border"
          style={{
            background: "var(--card-bg)",
            borderColor: "var(--border)",
            color: "var(--muted)",
          }}
        >
          정산 데이터가 없습니다.
        </div>
      ) : (
        filteredMonths.map((month) => (
          <MonthGroup
            key={month}
            month={month}
            companyGroups={grouped[month]}
            onMarkPaid={handleMarkPaid}
            updatingId={updatingId}
          />
        ))
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div
      className="rounded-xl p-5 border"
      style={{ background: "var(--card-bg)", borderColor: "var(--border)" }}
    >
      <div className="text-2xl font-bold" style={{ color }}>
        {value}
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
        {label}
      </div>
    </div>
  );
}

function MonthGroup({
  month,
  companyGroups,
  onMarkPaid,
  updatingId,
}: {
  month: string;
  companyGroups: { [company: string]: Task[] };
  onMarkPaid: (task: Task) => void;
  updatingId: string | null;
}) {
  const monthTotal = Object.values(companyGroups)
    .flat()
    .filter((t) => t.status === "입금 완료")
    .reduce((s, t) => s + (parseInt(t.amount) || 0), 0);

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ background: "var(--card-bg)", borderColor: "var(--border)" }}
    >
      {/* 월 헤더 */}
      <div
        className="px-5 py-3 flex items-center justify-between border-b"
        style={{ borderColor: "var(--border)", background: "#0d0d2a" }}
      >
        <span className="font-medium text-white">{month}</span>
        <span className="text-sm" style={{ color: "#3b82f6" }}>
          입금 완료: {monthTotal.toLocaleString()}원
        </span>
      </div>

      {/* 업체별 목록 */}
      {Object.entries(companyGroups).map(([companyName, tasks]) => {
        const companyTotal = tasks
          .filter((t) => t.status === "입금 완료")
          .reduce((s, t) => s + (parseInt(t.amount) || 0), 0);

        return (
          <div
            key={companyName}
            className="border-b last:border-0"
            style={{ borderColor: "var(--border)" }}
          >
            {/* 업체 헤더 */}
            <div
              className="px-5 py-2 flex items-center justify-between"
              style={{ background: "#0f0f22" }}
            >
              <span
                className="text-sm font-medium"
                style={{ color: "#a5b4fc" }}
              >
                {companyName}
              </span>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {tasks.length}건 / {companyTotal.toLocaleString()}원
              </span>
            </div>

            {/* 태스크 행 */}
            <table className="w-full text-sm">
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-t"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <td className="px-5 py-2.5" style={{ color: "#a5b4fc" }}>
                      {task.keyword}
                    </td>
                    <td
                      className="px-3 py-2.5"
                      style={{ color: "var(--muted)" }}
                    >
                      {task.brand}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {task.amount ? (
                        <span className="text-white">
                          {parseInt(task.amount).toLocaleString()}원
                        </span>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>-</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          background:
                            task.status === "입금 완료"
                              ? "#05221620"
                              : "#2d1a0020",
                          color:
                            task.status === "입금 완료"
                              ? "#10b981"
                              : "#f59e0b",
                        }}
                      >
                        {task.status === "입금 완료"
                          ? "입금완료"
                          : "정산대기"}
                      </span>
                    </td>
                    <td
                      className="px-3 py-2.5 text-xs"
                      style={{ color: "var(--muted)" }}
                    >
                      {new Date(task.updated_at).toLocaleDateString("ko-KR")}
                    </td>
                    <td className="px-3 py-2.5">
                      {task.status !== "입금 완료" && (
                        <button
                          onClick={() => onMarkPaid(task)}
                          disabled={updatingId === task.id}
                          className="px-3 py-1 rounded text-xs font-medium text-white disabled:opacity-50"
                          style={{ background: "#10b981" }}
                        >
                          {updatingId === task.id ? "처리중" : "입금완료"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
