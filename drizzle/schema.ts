import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const sharedAssets = mysqlTable("shared_assets", {
  id: int("id").autoincrement().primaryKey(),
  kind: mysqlEnum("kind", ["file", "config"]).notNull(),
  title: varchar("title", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull().default("General"),
  description: text("description"),
  fileName: varchar("fileName", { length: 255 }),
  mimeType: varchar("mimeType", { length: 120 }),
  storageKey: varchar("storageKey", { length: 500 }),
  contentText: text("contentText"),
  sizeBytes: int("sizeBytes"),
  published: int("published").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const techServices = mysqlTable("tech_services", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 160 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  description: text("description").notNull(),
  url: varchar("url", { length: 500 }),
  published: int("published").default(1).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const telegramSubscribers = mysqlTable("telegram_subscribers", {
  id: int("id").autoincrement().primaryKey(),
  telegramUserId: varchar("telegramUserId", { length: 32 }).notNull().unique(),
  username: varchar("username", { length: 120 }),
  firstName: varchar("firstName", { length: 120 }),
  lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type SharedAsset = typeof sharedAssets.$inferSelect;
export type TechService = typeof techServices.$inferSelect;
