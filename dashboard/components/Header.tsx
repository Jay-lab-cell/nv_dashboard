"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { schedulerApi, SchedulerStatus } from "@/lib/api";

export default function Header() {
  const pathname = usePathname();
  const [scheduler, setScheduler] = useState<SchedulerStatus | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    schedulerApi.status().then(setScheduler).catch(console.error);
  }, []);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await schedulerApi.toggle();
      const status = await schedulerApi.status();
      setScheduler(status);
    } catch (e) {
      console.error(e);
    } finally {
      setToggling(false);
    }
  };

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`px-6 py-2 rounded-full text-sm transition-colors ${active
            ? "bg-[#1E2034] text-white font-medium"
            : "text-[var(--muted)] hover:text-white"
          }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <header className="sticky top-0 z-50 bg-[#0F111A]">
      <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between">
        {/* 로고 */}
        <div className="flex items-center gap-3 w-64">
          <div
            className="w-8 h-8 rounded shrink-0 flex items-center justify-center text-white font-bold"
            style={{ background: "#7E57C2" }}
          >
            N
          </div>
          <span className="font-bold text-white tracking-wide">N-Monitor</span>
        </div>

        {/* 네비게이션 */}
        <nav className="flex items-center gap-2">
          {navLink("/", "메인 대시보드")}
          {navLink("/archive", "정산 아카이브")}
        </nav>

        {/* 스케줄러 토글 */}
        <div className="flex items-center justify-end w-64 gap-3">
          {scheduler?.running && scheduler.jobs[0]?.next_run && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              다음: {new Date(scheduler.jobs[0].next_run).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <button
            onClick={handleToggle}
            disabled={toggling || !scheduler}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-bold transition-colors ${scheduler?.running
                ? "border border-[#064E3B] bg-[#022C22] text-[#10B981]"
                : "border border-gray-700 bg-transparent text-gray-500"
              } disabled:opacity-50`}
          >
            24H 자동 모니터링 {scheduler?.running ? "ON" : "OFF"}
            <span
              className={`w-2 h-2 rounded-full ${scheduler?.running ? "bg-[#10B981]" : "bg-gray-500"
                }`}
            />
          </button>
        </div>
      </div>
    </header>
  );
}
