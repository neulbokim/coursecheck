import { boolean, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    eventName: text("event_name").notNull(),
    /**
     * 이벤트에 붙는 사용자 속성. 소속(대학)·1전공·학번·이수학기까지 남겨 관리 화면에서 단위를 바꿔 봅니다.
     * 셋이 함께 있으면 인원이 적은 조합에서는 사실상 개인을 가리키므로, 관리 화면은
     * 합계만 보여주고 방문자 ID와는 잇지 않습니다(어느 행이 누구인지 되짚을 수 없음).
     */
    college: text("college"),
    major: text("major"),
    cohortYear: integer("cohort_year"),
    completedSemesters: integer("completed_semesters"),
    /**
     * 한 사람의 기록을 이어 흐름을 보기 위한 방문자 ID. 선택 동의를 한 사람에게만 채웁니다.
     * 이 값이 있으면 그 사람의 사용 순서를 따라갈 수 있고 user_profiles와도 이어지므로,
     * 동의를 거두면 지난 기록에서도 이 값과 소속·전공·학번을 지웁니다.
     */
    visitorId: text("visitor_id"),
    resultBucket: text("result_bucket"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("analytics_events_created_at_idx").on(table.createdAt)],
);

/**
 * 에브리타임을 읽다가 실패한 사유. 화면에는 다듬은 문장 하나만 나가고 사유가 사라지므로,
 * 배포에서도 무엇이 왜 안 됐는지 세어 볼 수 있게 남깁니다.
 *
 * 사유는 앱이 정해 둔 코드만 넣습니다. 던져진 오류 문구를 그대로 담으면 뜻밖의 값이
 * 섞일 수 있어서, 예상 못 한 오류는 unknown으로 세고 원본은 Vercel 런타임 로그에만 남깁니다.
 * 누가 무엇을 봤는지는 담지 않습니다 — 공유 링크와 토큰, 방문자 ID 모두 넣지 않습니다.
 */
export const everytimeFailures = pgTable(
  "everytime_failures",
  {
    id: serial("id").primaryKey(),
    /** request(요청 전체) 또는 semester(학기 하나만 못 읽음) */
    scope: text("scope").notNull(),
    /** 요청 전체가 실패했을 때 어디까지 갔는지: link·bootstrap·first_table·terms */
    step: text("step"),
    reasonCode: text("reason_code").notNull(),
    /** 학기 하나만 실패했을 때 어느 학기인지 (예: 2025년 2학기) */
    semester: text("semester"),
    elapsedMs: integer("elapsed_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("everytime_failures_created_at_idx").on(table.createdAt)],
);

/**
 * 관리자 로그인 시도 제한. 원본 IP는 저장하지 않고 ADMIN_TOKEN으로 서명해
 * 잘라낸 해시만 묶음 키로 씁니다. 로그인에 성공하면 행을 지웁니다.
 */
export const adminLoginAttempts = pgTable("admin_login_attempts", {
  clientHash: text("client_hash").primaryKey(),
  attempts: integer("attempts").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull().defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
});

/** 개발자에게 건의하기: 사용자가 직접 쓴 의견만 단방향으로 받습니다. 답장 수단은 저장하지 않습니다. */
export const feedbackMessages = pgTable("feedback_messages", {
  id: serial("id").primaryKey(),
  visitorId: text("visitor_id"),
  category: text("category").notNull(),
  message: text("message").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const userProfiles = pgTable("user_profiles", {
  visitorId: text("visitor_id").primaryKey(),
  cohortYear: integer("cohort_year").notNull(),
  completedSemesters: integer("completed_semesters").notNull(),
  college: text("college"),
  major1: text("major_1").notNull(),
  major2: text("major_2"),
  major3: text("major_3"),
  // 복수전공 신청이 승인되기 전에는 해당 대학·학과 제한 과목을 신청할 수 없다.
  // 기존 행은 신청 완료로 보아 과목을 감추지 않는다.
  major2Approved: boolean("major_2_approved").notNull().default(true),
  major3Approved: boolean("major_3_approved").notNull().default(true),
  // 졸업생·외부인이 구경하려고 넣은 설정인지. 집계에서 재학생과 섞이면 사용 지표가 부풀려집니다.
  // 기존 행은 재학생으로 봅니다.
  enrolled: boolean("enrolled").notNull().default(true),
  /**
   * 이용 기록에 소속·1전공·입학연도·이수학기를 함께 남겨도 되는지에 대한 선택 동의.
   * 동의하지 않으면 이벤트에 이름과 묶음 값만 남습니다.
   * 기존 행은 이 문구로 동의를 받은 적이 없으므로 false에서 시작합니다.
   */
  analyticsConsent: boolean("analytics_consent").notNull().default(false),
  /**
   * 만드는 사람이 직접 눌러 본 설정인지. 관리자로 로그인한 브라우저에서 저장하면 켜지고,
   * 관리 화면의 사람 수·소속·전공·학번 분포에서 빠집니다.
   *
   * 한 번 켜지면 스스로 꺼지지 않습니다 — 관리자 세션은 8시간이면 끝나는데 그 뒤에 설정을
   * 한 번 더 저장했다고 내 브라우저가 갑자기 남의 것으로 세어지면 안 되기 때문입니다.
   * 되돌리려면 그 행을 지웁니다.
   */
  excluded: boolean("excluded").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
