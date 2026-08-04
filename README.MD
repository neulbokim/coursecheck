# CourseCheck

서강대학교 대학요람의 전공 인정과목과 학기별 개설교과목정보를 합쳐, 내 전공에 해당하는 과목을 시간표 형태로 보여주는 프로젝트입니다.

## 현재 구성

- `web/`: 실제 배포용 웹앱
- `data/`: 서강대학교 개설교과목정보에서 내려받은 학기별 원본
- `semester-course.ipynb`, `timetable.ipynb`, `check-semester.ipynb`: 초기 분석 노트북(참고용)

웹앱에서는 사용자별 전공·수강 과목을 코드에 직접 적지 않습니다.

- 일반 전공: 개설과목 데이터의 `학과` 목록에서 자동 생성
- 연계전공: `web/app/data/majors.ts` 한 곳에서 요람 기준 과목번호 관리
- 들은 과목: 에브리타임 공개 시간표 링크를 일회성으로 확인하고 브라우저 메모리에서만 비교
- 운영 로그: 개인 식별정보 없이 화면 조회·필터 선택·가져오기 성공 구간만 집계

## 데이터 업데이트

1. 개설교과목정보에서 새 학기 `.xls` 파일을 `data/`에 저장합니다.
2. `web/scripts/import-sis.mjs`의 원본 파일명을 새 학기로 바꿉니다.
3. `web` 폴더에서 `npm run data:import`를 실행합니다.
4. 대학요람 또는 전공 홈페이지에서 연계전공 과목표를 확인하고 `web/app/data/majors.ts`를 갱신합니다.
5. 화면의 학기명과 데이터 기준일을 바꾼 뒤 빌드합니다.

## 공식 출처

- [서강대학교 대학요람](https://www.sogang.ac.kr/ko/academic-support/college-bulletin)
- [서강대학교 개설교과목정보](https://sis109.sogang.ac.kr/sap/bc/webdynpro/sap/zcmw9016?sap-language=KO#)
- [빅데이터사이언스 연계전공 교과목안내](https://bds.sogang.ac.kr/bds/bds02_1.html)

학교 공식 서비스가 아니므로 실제 수강신청 전에는 반드시 학교 정보를 다시 확인해야 합니다.

## 보안·개인정보

자세한 내용은 [`web/SECURITY.md`](web/SECURITY.md)를 참고하세요.

