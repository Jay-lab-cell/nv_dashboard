"use client";

import { Summary } from "@/lib/api";

interface Props {
  summary: Summary | null;
  activeFilter: string;
  onFilter: (status: string) => void;
}

const STATUS_CARDS = [
  { key: "total", label: "전체 활성", color: "#FFFFFF" },
  { key: "대기", label: "대기", color: "#6084F7" },
  { key: "최초 노출", label: "최초 노출", color: "#8B5CF6" },
  { key: "건바이 성공", label: "건바이 성공", color: "#10B981" },
  { key: "미노출 AS", label: "미노출 AS", color: "#EF4444" },
  { key: "미노출", label: "미노출", color: "#F59E0B" },
];

export default function SummaryCards({
  summary,
  activeFilter,
  onFilter,
}: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
      {STATUS_CARDS.map(({ key, label, color }) => {
        const count = summary
          ? ((summary as unknown) as Record<string, number>)[key] ?? 0
          : 0;
        const isActive = activeFilter === key;

        return (
          <button
            key={key}
            onClick={() => onFilter(key)}
            className="rounded-2xl p-5 text-left transition-all relative overflow-hidden flex flex-col justify-between h-24"
            style={{
              background: "#1C1E2B",
              boxShadow: isActive ? `0 0 0 1px ${color}80` : "none",
            }}
          >
            <div
              className="text-xs font-medium"
              style={{ color: "#8B93A6" }}
            >
              {label}
            </div>
            <div className="flex items-baseline gap-1 mt-2">
              <span className="text-2xl font-bold" style={{ color }}>
                {count}
              </span>
              <span
                className="text-sm font-medium"
                style={{ color: "#8B93A6" }}
              >
                건
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
