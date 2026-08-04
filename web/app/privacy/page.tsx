import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보 처리방침 | CourseCheck",
  description: "CourseCheck가 무엇을 저장하고 무엇을 저장하지 않는지 정리했습니다.",
};

export default function PrivacyPage() {
  return (
    <main className="doc-page">
      <header>
        <Link className="brand" href="/" aria-label="CourseCheck 처음으로">
          <span className="brand-mark">C</span>
          <span><strong>CourseCheck</strong><small>SOGANG</small></span>
        </Link>
      </header>

      <article>
        <h1>개인정보 처리방침</h1>
        <p className="doc-lead">
          CourseCheck는 학교 공식 서비스가 아닌 개인 프로젝트입니다. 시간표를 만드는 데 꼭 필요한 것만 저장하고,
          그 밖의 수집은 동의를 받은 경우에만 합니다.
        </p>

        <h2>저장하는 것</h2>
        <ul>
          <li><strong>설정</strong> — 입학 연도, 이수학기 수, 소속 대학, 1·2·3전공, 복수전공 신청 여부, 재학 여부</li>
          <li><strong>익명 브라우저 ID</strong> — 다시 방문했을 때 설정을 찾기 위한 임의의 값. 쿠키에만 담기며 사람과 잇지 않습니다.</li>
          <li><strong>건의</strong> — 직접 써서 보낸 내용. 답장 수단은 받지 않습니다.</li>
        </ul>

        <h2>저장하지 않는 것</h2>
        <ul>
          <li>이름, 전체 학번, 이메일, 전화번호</li>
          <li>IP 주소와 브라우저 정보</li>
          <li>에브리타임 공유 링크와 그 원문 — 과목명만 비교하고 응답 직후 버립니다</li>
          <li>필수 교양 체크 결과 — 브라우저 안에서만 계산합니다</li>
          <li>담은 과목 — 이 브라우저에만 저장되고 서버로 보내지 않습니다</li>
        </ul>

        <h2>이용 기록</h2>
        <p>
          어떤 기능이 얼마나 쓰이는지 보기 위해 <strong>기능 이름과 결과 구간</strong>(예: 결과가 26과목 이상)을 남깁니다.
          여기에는 누구인지 알 수 있는 값이 들어가지 않습니다.
        </p>
        <p>
          설정 화면에서 <strong>선택 동의</strong>를 하면 여기에 <strong>소속 대학·1전공·입학연도</strong>가 함께 남습니다.
          어느 전공·학번이 무엇을 필요로 하는지 보고 다음 학기에 고치는 데 씁니다.
          해당하는 사람이 적은 조합에서는 이 기록으로 누구인지 짐작될 수 있으므로, 동의한 경우에만 남깁니다.
          <strong>동의하지 않아도 모든 기능을 똑같이 쓸 수 있고</strong>, 설정을 다시 열어 언제든 바꿀 수 있습니다.
        </p>
        <p>
          이용 기록에는 브라우저 ID를 붙이지 않습니다. 그래서 기록끼리 이어 붙여 한 사람의 사용 흐름을 따라갈 수 없습니다.
          30일이 지난 기록은 정리합니다.
        </p>

        <h2>에브리타임 가져오기</h2>
        <ul>
          <li>에브리타임 공식 도메인의 공개 공유 링크만 허용합니다.</li>
          <li>로그인 비밀번호나 계정 권한을 요구하지 않습니다.</li>
          <li>공개된 시간표에서 과목명·교수·강의실만 읽고, 원문과 링크는 저장하지 않습니다.</li>
        </ul>

        <h2>보관과 삭제</h2>
        <p>
          설정을 지우고 싶으면 <Link href="/">첫 화면</Link>의 건의하기로 알려주시거나 브라우저 쿠키를 지우면 됩니다.
          쿠키를 지우면 저장된 설정과의 연결이 끊어져 다시 찾을 수 없게 됩니다.
        </p>

        <h2>문의</h2>
        <p>화면 오른쪽 아래 <strong>개발자에게 건의하기</strong>로 보내주세요.</p>

        <p className="doc-foot"><Link href="/">← 시간표로 돌아가기</Link></p>
      </article>
    </main>
  );
}
