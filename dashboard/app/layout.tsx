import type { Metadata } from "next";
import "./globals.css";
import Header from "@/components/Header";

export const metadata: Metadata = {
  title: "N-Monitor — 네이버 카페 키워드 모니터링",
  description: "네이버 카페 키워드 노출 모니터링 대시보드",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased bg-[#0F111A]">
        <Header />
        <main className="max-w-screen-2xl mx-auto px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
