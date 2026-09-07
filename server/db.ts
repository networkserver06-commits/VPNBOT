import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser,
  sharedAssets,
  techServices,
  telegramSubscribers,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (!Object.keys(updateSet).length) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function listAssets(includeUnpublished = false) {
  const db = await getDb();
  if (!db) return [];
  const condition = includeUnpublished ? undefined : eq(sharedAssets.published, 1);
  return db.select().from(sharedAssets).where(condition).orderBy(desc(sharedAssets.createdAt));
}

export async function getAsset(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(sharedAssets).where(eq(sharedAssets.id, id)).limit(1);
  return result[0];
}

export async function createAsset(input: typeof sharedAssets.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(sharedAssets).values(input);
  return Number(result[0].insertId);
}

export async function setAssetPublished(id: number, published: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.update(sharedAssets).set({ published: published ? 1 : 0 }).where(eq(sharedAssets.id, id));
}

export async function listServices(includeUnpublished = false) {
  const db = await getDb();
  if (!db) return [];
  const condition = includeUnpublished ? undefined : eq(techServices.published, 1);
  return db.select().from(techServices).where(condition).orderBy(desc(techServices.createdAt));
}

export async function createService(input: typeof techServices.$inferInsert) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  const result = await db.insert(techServices).values(input);
  return Number(result[0].insertId);
}

export async function setServicePublished(id: number, published: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Database is not configured");
  await db.update(techServices).set({ published: published ? 1 : 0 }).where(eq(techServices.id, id));
}

export async function upsertTelegramSubscriber(input: {
  telegramUserId: string;
  username?: string;
  firstName?: string;
}) {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(telegramSubscribers)
    .values({
      telegramUserId: input.telegramUserId,
      username: input.username ?? null,
      firstName: input.firstName ?? null,
      lastSeenAt: new Date(),
    })
    .onDuplicateKeyUpdate({
      set: {
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastSeenAt: new Date(),
      },
    });
}

export async function getDashboardCounts() {
  const [assets, services, subscribers] = await Promise.all([
    listAssets(true),
    listServices(true),
    (async () => {
      const db = await getDb();
      return db ? db.select().from(telegramSubscribers) : [];
    })(),
  ]);
  return {
    assets: assets.length,
    publishedAssets: assets.filter(item => item.published === 1).length,
    services: services.length,
    publishedServices: services.filter(item => item.published === 1).length,
    subscribers: subscribers.length,
  };
}
