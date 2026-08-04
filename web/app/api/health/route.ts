/**
 * 지금 이 URL이 어느 코드로 떠 있는지 확인하는 곳입니다.
 * 배포가 반영됐는지, 방금 고친 커밋이 맞는지 여기로 확인하세요.
 *
 *   curl -s https://<배포 URL>/api/health
 *
 * 커밋 해시 외에 다른 정보는 담지 않습니다(공개 저장소라 해시 자체는 비밀이 아닙니다).
 */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(
    {
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
      revision: process.env.NEXT_PUBLIC_BUILD_REV ?? "unknown",
      builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? null,
      environment: process.env.VERCEL_ENV ?? "development",
    },
    { headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } },
  );
}
