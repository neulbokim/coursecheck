# CourseCheck Web

CourseCheck의 배포용 웹앱입니다. 2026학년도 2학기 개설과목 1,482개를 정규화해 일반 전공과 연계전공별 시간표를 만듭니다.

## 실행

```bash
npm install
npm run dev
```

## 확인

```bash
npm run build
npm audit --omit=dev
```

## 데이터와 설정

- `app/data/courses.generated.json`: SIS 원본에서 생성된 배포 데이터
- `app/data/majors.ts`: 연계전공 과목표와 공식 출처
- `scripts/import-sis.mjs`: SIS HTML 형식 `.xls` 정규화 도구
- `db/schema.ts`: 개인정보 없는 익명 운영 이벤트 스키마
- `drizzle/`: 배포 시 적용되는 D1 마이그레이션

## 운영 통계

`GET /api/stats`는 이벤트 이름별 합계만 반환합니다. 원본 요청, IP, 사용자 에이전트, 에브리타임 링크 또는 토큰은 앱 데이터베이스에 저장하지 않습니다.

