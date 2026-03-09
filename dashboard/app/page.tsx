"use client";

import { useCallback, useEffect, useState } from "react";
import { tasksApi, exposureApi, Task, Summary, TaskStatus } from "@/lib/api";
import SummaryCards from "@/components/SummaryCards";
import TaskForm from "@/components/TaskForm";
import TaskTable from "@/components/TaskTable";
import ProgressOverlay from "@/components/ProgressOverlay";

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [filterStatus, setFilterStatus] = useState("total");
  const [loading, setLoading] = useState(true);
  const [activeJobs, setActiveJobs] = useState<
    { jobId: string; taskId: string }[]
  >([]);

  // 데이터 로드
  const loadData = useCallback(async () => {
    try {
      const [taskList, summaryData] = await Promise.all([
        tasksApi.list(),
        tasksApi.summary(),
      ]);
      setTasks(taskList);
      setSummary(summaryData);
    } catch (e) {
      console.error("데이터 로드 실패:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 태스크 생성 콜백
  const handleCreated = (newTasks: Task[]) => {
    setTasks((prev) => [...newTasks, ...prev]);
    tasksApi.summary().then(setSummary).catch(console.error);
  };

  // 검사 시작 콜백
  const handleCheckStart = (jobId: string, taskId: string) => {
    setActiveJobs((prev) => [...prev, { jobId, taskId }]);
  };

  // 상태 변경 콜백
  const handleStatusChange = (taskId: string, newStatus: TaskStatus) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t))
    );
    tasksApi.summary().then(setSummary).catch(console.error);
  };

  // 삭제 콜백
  const handleDelete = (taskId: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));
    tasksApi.summary().then(setSummary).catch(console.error);
  };

  // 작업 완료 콜백 (SSE 종료 후)
  const handleJobComplete = (taskId: string) => {
    tasksApi
      .get(taskId)
      .then((updated) => {
        setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
      })
      .catch(console.error);

    tasksApi.summary().then(setSummary).catch(console.error);
    setActiveJobs((prev) => prev.filter((j) => j.taskId !== taskId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{
            borderColor: "var(--accent)",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <SummaryCards
        summary={summary}
        activeFilter={filterStatus}
        onFilter={setFilterStatus}
      />

      {/* 태스크 등록 폼 */}
      <TaskForm onCreated={handleCreated} />

      {/* 액션 바 */}
      <div className="flex items-center justify-between">
        <h2
          className="text-sm font-medium"
          style={{ color: "var(--muted)" }}
        >
          태스크 목록 ({tasks.length}개)
        </h2>
      </div>

      {/* 태스크 테이블 */}
      <TaskTable
        tasks={tasks}
        filterStatus={filterStatus}
        onCheckStart={handleCheckStart}
        onStatusChange={handleStatusChange}
        onDelete={handleDelete}
      />

      {/* SSE 진행 오버레이 */}
      <ProgressOverlay jobs={activeJobs} onJobComplete={handleJobComplete} />
    </div>
  );
}
