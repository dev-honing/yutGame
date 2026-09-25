import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Yutnori Arena",
  description: "초대 링크로 바로 시작하는 실시간 윷놀이",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
