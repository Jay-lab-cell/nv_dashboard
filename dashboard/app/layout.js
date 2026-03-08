import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

export const metadata = {
  title: "N-Monitor | 네이버 카페 댓글 모니터링 대시보드",
  description: "건바이건 마케팅 실행사의 네이버 카페 댓글 노출 성과를 자동 검증하고 정산 데이터를 관리하는 사내 대시보드",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body className={inter.variable}>
        {children}
      </body>
    </html>
  );
}
