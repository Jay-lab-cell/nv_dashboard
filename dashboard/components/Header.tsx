"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Header() {
  const pathname = usePathname();

  const navLink = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`px-6 py-2 rounded-full text-sm transition-colors ${
          active
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

        {/* 빈 공간 (오른쪽 정렬) */}
        <div className="w-64" />
      </div>
    </header>
  );
}
