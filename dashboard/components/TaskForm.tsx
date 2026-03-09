"use client";

import { useState } from "react";
import { tasksApi, Task, TaskCreatePayload } from "@/lib/api";

interface Props {
  onCreated: (tasks: Task[]) => void;
}

export default function TaskForm({ onCreated }: Props) {
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<TaskCreatePayload>({
    cafe_name: "", // 업체에 매핑
    cafe_url: "https://cafe.naver.com", // 기본값
    keywords: "",
    brand_name: "",
    price: 0,
    note: "", // 담당자에 매핑
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.keywords || !form.brand_name) {
      alert("키워드와 브랜드명을 입력하세요.");
      return;
    }

    setLoading(true);
    try {
      const created = await tasksApi.create({
        ...form,
        cafe_name: form.cafe_name || "미지정",
        cafe_url: form.cafe_url || "https://cafe.naver.com"
      });
      onCreated(created);
      setForm({ cafe_name: "", cafe_url: "https://cafe.naver.com", keywords: "", brand_name: "", price: 0, note: "" });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "등록 실패");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#1C1E2B", padding: open ? "24px 32px" : "16px 24px" }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-1 h-5 rounded-full" style={{ background: "#8B5CF6" }} />
          <span className="font-bold text-white tracking-wide text-lg">키워드 등록</span>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
          style={{ background: "#25283A", color: "#8B93A6" }}
        >
          {open ? "접기 ▲" : "열기 ▼"}
        </button>
      </div>

      {/* 폼 본체 */}
      {open && (
        <form onSubmit={handleSubmit} className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-2" style={{ color: "#8B93A6" }}>
              키워드 (줄바꿈으로 다중 입력)
            </label>
            <textarea
              value={form.keywords}
              onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              className="w-full bg-[#111116] border border-[#2D3142] rounded-xl p-4 text-sm text-white resize-none outline-none focus:border-[#8B5CF6] transition-colors"
              rows={4}
            />
          </div>

          <div className="flex items-end gap-4 lg:w-[600px]">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-2" style={{ color: "#8B93A6" }}>
                브랜드명
              </label>
              <input
                value={form.brand_name}
                onChange={(e) => setForm({ ...form, brand_name: e.target.value })}
                className="w-full bg-[#111116] border border-[#2D3142] rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:border-[#8B5CF6] transition-colors"
              />
            </div>

            <div className="w-32">
              <label className="block text-xs font-medium mb-2" style={{ color: "#8B93A6" }}>
                담당자
              </label>
              <select
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                className="w-full bg-[#111116] border border-[#2D3142] rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:border-[#8B5CF6] transition-colors appearance-none"
              >
                <option value="">선택</option>
                <option value="김동규">김동규</option>
                <option value="심민정">심민정</option>
              </select>
            </div>

            <div className="w-32">
              <label className="block text-xs font-medium mb-2" style={{ color: "#8B93A6" }}>
                업체
              </label>
              <select
                value={form.cafe_name}
                onChange={(e) => setForm({ ...form, cafe_name: e.target.value })}
                className="w-full bg-[#111116] border border-[#2D3142] rounded-xl px-4 py-3.5 text-sm text-white outline-none focus:border-[#8B5CF6] transition-colors appearance-none"
              >
                <option value="">선택</option>
                <option value="위너">위너</option>
                <option value="기타">기타</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="h-[50px] px-8 rounded-xl text-sm font-bold text-white transition-opacity disabled:opacity-50"
              style={{ background: "#7c3aed" }}
            >
              {loading ? "..." : "등록"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
