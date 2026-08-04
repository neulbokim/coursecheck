import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const title = "CourseCheck | 서강대 전공 시간표";
const description = "서강대학교 개설과목과 대학요람을 전공별 시간표로 확인하고, 에브리타임 수강 과목을 제외해 보세요.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const baseUrl = new URL(`${protocol}://${host}`);
  const imageUrl = new URL("/og.png", baseUrl).toString();
  return {
    metadataBase: baseUrl,
    title,
    description,
    openGraph: { title, description, siteName: "CourseCheck", locale: "ko_KR", type: "website", images: [{ url: imageUrl, width: 1200, height: 630, alt: "CourseCheck 전공 시간표" }] },
    twitter: { card: "summary_large_image", title, description, images: [imageUrl] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
