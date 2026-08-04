import { sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const analyticsEvents = sqliteTable("analytics_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  eventName: text("event_name").notNull(),
  majorKey: text("major_key"),
  resultBucket: text("result_bucket"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

