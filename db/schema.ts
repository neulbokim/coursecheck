import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analyticsEvents = sqliteTable("analytics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventName: text("event_name").notNull(),
  majorKey: text("major_key"),
  resultBucket: text("result_bucket"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const userProfiles = sqliteTable("user_profiles", {
  visitorId: text("visitor_id").primaryKey(),
  cohortYear: integer("cohort_year").notNull(),
  completedSemesters: integer("completed_semesters").notNull(),
  major1: text("major_1").notNull(),
  major2: text("major_2"),
  major3: text("major_3"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
