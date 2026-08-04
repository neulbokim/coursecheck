import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const analyticsEvents = pgTable("analytics_events", {
  id: serial("id").primaryKey(),
  eventName: text("event_name").notNull(),
  majorKey: text("major_key"),
  resultBucket: text("result_bucket"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
