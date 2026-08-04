import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: serial("id").primaryKey(),
    eventName: text("event_name").notNull(),
    /**
     * 이벤트에 붙는 사용자 속성. 소속(대학)·1전공·학번까지 남겨 관리 화면에서 단위를 바꿔 봅니다.
     * 셋이 함께 있으면 인원이 적은 조합에서는 사실상 개인을 가리키므로, 관리 화면은
     * 합계만 보여주고 방문자 ID와는 잇지 않습니다(어느 행이 누구인지 되짚을 수 없음).
     */
    college: text("college"),
    major: text("major"),
    cohortYear: integer("cohort_year"),
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
 * 관리 화면에서 올린 개설과목 데이터. 가장 최근 것을 씁니다.
 * 빌드에 포함된 courses.generated.json이 기본값이고, 이 표에 더 새 자료가 있으면 화면에서 갈아탑니다.
 */
export const courseDatasets = pgTable("course_datasets", {
  id: serial("id").primaryKey(),
  semester: text("semester").notNull(),
  courseCount: integer("course_count").notNull(),
  courses: jsonb("courses").notNull(),
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

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
   * 이용 기록에 소속·1전공·입학연도를 함께 남겨도 되는지에 대한 선택 동의.
   * 동의하지 않으면 이벤트에 이름과 묶음 값만 남습니다.
   * 기존 행은 이 문구로 동의를 받은 적이 없으므로 false에서 시작합니다.
   */
  analyticsConsent: boolean("analytics_consent").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
