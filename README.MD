# CourseCheck

서강대학교 대학요람의 전공 인정과목과 학기별 개설교과목정보를 합쳐, 내 전공에 해당하는 과목을 시간표 형태로 보여주는 프로젝트입니다.

## 현재 구성

- `web/`: 실제 배포용 웹앱 (Next.js + Neon PostgreSQL, Vercel 배포)
- `data/`: 서강대학교 개설교과목정보에서 내려받은 학기별 원본 `.xls`
- `notebooks/`: 초기 분석 노트북(참고용). 웹앱이 나오기 전 데이터 구조를 살펴보던 기록이며, 지금은 `web/app/lib/sis-parse.mjs`가 같은 일을 합니다. 저장소를 가볍게 두려고 실행 출력은 지웠으니 필요하면 직접 실행하세요. `data/`를 상대 경로로 읽으므로 `notebooks/` 안에서 실행해야 합니다.

웹앱에서는 사용자별 전공·수강 과목을 코드에 직접 적지 않습니다.

- 일반 전공: 개설과목 데이터의 `학과` 목록에서 자동 생성
- 연계전공: `web/app/data/majors.ts` 한 곳에서 요람 기준 과목번호 관리
- 들은 과목: 에브리타임 공개 시간표 링크를 일회성으로 확인하고 브라우저 메모리에서만 비교
- 운영 로그: 이벤트 이름과 묶음 값만 남기고, 소속 대학·1전공·입학연도는 **선택 동의를 한 사람에게만** 붙입니다. 동의하면 방문자 ID도 붙어 같은 사람의 기록이 순서대로 이어지고, 동의를 거두면 이미 쌓인 기록에서도 지웁니다. 사용자용 설명은 `/privacy`, 자세한 내용은 [`web/SECURITY.md`](web/SECURITY.md)

## 데이터 업데이트

[개설교과목정보](https://sis109.sogang.ac.kr/sap/bc/webdynpro/sap/zcmw9016?sap-language=KO)에서 학년도·학기를 골라 조회한 뒤 엑셀로 내려받습니다. 두 가지 방법이 있습니다.

**관리 화면 업로드 (재배포 불필요)** — `/admin` → 개설과목 탭에 파일을 올리면 바로 반영됩니다. 학기 중 갱신은 이쪽을 씁니다.

**CLI (빌드에 포함된 기본 자료 교체)**

```bash
cp ~/Downloads/새파일.xls data/2026-2-sis.xls
cd web && npm run data:import 2026-2-sis.xls
```

연계전공 과목표가 바뀌었다면 대학요람 또는 전공 홈페이지를 확인하고 `web/app/data/majors.ts`도 함께 갱신합니다.

## 배포

`web/`에서 다음을 실행합니다. 점검이 커밋하지 않은 변경이나 원격에 올리지 않은 커밋을 먼저 막습니다.

```bash
cd web && npm run deploy
```

지금 떠 있는 코드가 어느 커밋인지는 푸터의 `v0.1.0 · 커밋해시` 또는 `curl -s https://<배포 URL>/api/health`로 확인합니다. 자세한 내용은 [`web/README.md`](web/README.md#배포-버전-관리)를 참고하세요.

## 공식 출처

- [서강대학교 대학요람](https://www.sogang.ac.kr/ko/academic-support/college-bulletin)
- [서강대학교 개설교과목정보](https://sis109.sogang.ac.kr/sap/bc/webdynpro/sap/zcmw9016?sap-language=KO#)
- [빅데이터사이언스 연계전공 교과목안내](https://bds.sogang.ac.kr/bds/bds02_1.html)

학교 공식 서비스가 아니므로 실제 수강신청 전에는 반드시 학교 정보를 다시 확인해야 합니다.

## 보안·개인정보

자세한 내용은 [`web/SECURITY.md`](web/SECURITY.md)를 참고하세요.
