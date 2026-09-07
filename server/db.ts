import { GridFSBucket, MongoClient, ObjectId } from "mongodb";
import { ENV } from "./env.js";

export type Asset = { id: number; kind: "file" | "config"; title: string; category: string; fileName?: string | null; mimeType?: string | null; storageKey?: string | null; contentText?: string | null; sizeBytes?: number | null; published: number; expiresAt?: Date | null; createdAt: Date; updatedAt: Date };
export type Service = { id: number; title: string; category: string; description: string; url?: string | null; published: number; createdAt: Date; updatedAt: Date };
let client: MongoClient | undefined; let db: ReturnType<MongoClient["db"]> | undefined; let bucket: GridFSBucket | undefined; let connecting: Promise<void> | undefined;
export async function getMongo() {
  if (!ENV.mongodbUri) throw new Error("MONGODB_URI is not configured");
  if (!db || !bucket) {
    connecting ??= (async () => {
      const nextClient = new MongoClient(ENV.mongodbUri, { tls: true, family: 4, serverSelectionTimeoutMS: 8000, connectTimeoutMS: 8000 });
      try {
        await nextClient.connect();
        const nextDb = nextClient.db(ENV.mongodbDatabase);
        client = nextClient;
        db = nextDb;
        bucket = new GridFSBucket(nextDb, { bucketName: "files" });
      } catch (error) {
        await nextClient.close().catch(() => undefined);
        throw error;
      } finally {
        connecting = undefined;
      }
    })();
    await connecting;
  }
  return { db: db!, bucket: bucket! };
}
async function nextId(name: string) { const { db } = await getMongo(); const result = await db.collection<{ _id: string; value: number }>("counters").findOneAndUpdate({ _id: name }, { $inc: { value: 1 } }, { upsert: true, returnDocument: "after" }); return result!.value; }
export async function upsertTelegramSubscriber(input: { telegramUserId: string; username?: string; firstName?: string; lastName?: string; languageCode?: string; isPremium?: boolean; chatType?: string }) { const { db } = await getMongo(); const now = new Date(); const result = await db.collection("telegramSubscribers").updateOne({ telegramUserId: input.telegramUserId }, { $set: { username: input.username ?? null, firstName: input.firstName ?? null, lastName: input.lastName ?? null, languageCode: input.languageCode ?? null, isPremium: input.isPremium ?? false, chatType: input.chatType ?? "private", lastSeenAt: now }, $setOnInsert: { firstSeenAt: now } }, { upsert: true }); return Boolean(result.upsertedId); }
export async function getTelegramSubscriber(telegramUserId: string) { const { db } = await getMongo(); return db.collection("telegramSubscribers").findOne({ telegramUserId }); }
export async function listTelegramSubscribers() { const { db } = await getMongo(); return db.collection("telegramSubscribers").find({}, { projection: { telegramUserId: 1, username: 1, firstName: 1, lastName: 1, languageCode: 1, isPremium: 1, chatType: 1, firstSeenAt: 1, lastSeenAt: 1 } }).sort({ lastSeenAt: -1 }).toArray(); }
export async function listAssets(includeUnpublished = false) { const { db } = await getMongo(); return db.collection<Asset>("assets").find({ ...(includeUnpublished ? {} : { published: 1 }), $or: [{ expiresAt: null }, { expiresAt: { $exists: false } }, { expiresAt: { $gt: new Date() } }] }).sort({ createdAt: -1 }).toArray(); }
export async function getAsset(id: number) { const { db } = await getMongo(); return db.collection<Asset>("assets").findOne({ id }); }
export async function createAsset(input: Omit<Asset, "id" | "createdAt" | "updatedAt">) { const { db } = await getMongo(); const now = new Date(); const asset = { ...input, id: await nextId("assets"), createdAt: now, updatedAt: now }; await db.collection<Asset>("assets").insertOne(asset); return asset.id; }
export async function listServices(includeUnpublished = false) { const { db } = await getMongo(); return db.collection<Service>("services").find(includeUnpublished ? {} : { published: 1 }).sort({ createdAt: -1 }).toArray(); }
export async function createService(input: Omit<Service, "id" | "createdAt" | "updatedAt">) { const { db } = await getMongo(); const now = new Date(); const service = { ...input, id: await nextId("services"), createdAt: now, updatedAt: now }; await db.collection<Service>("services").insertOne(service); return service.id; }
export async function createPaymentLink(input: { slug: string; amount: number; description?: string | null; createdBy: string }) { const { db } = await getMongo(); const now = new Date(); await db.collection("paymentLinks").updateOne({ slug: input.slug }, { $set: { ...input, active: true, updatedAt: now }, $setOnInsert: { createdAt: now } }, { upsert: true }); return input.slug; }
export async function getPaymentLink(slug: string) { const { db } = await getMongo(); return db.collection<{ slug: string; amount: number; description?: string; active: boolean }>("paymentLinks").findOne({ slug: slug.toLowerCase(), active: true }); }
export async function setAssetExpiry(id: number, expiresAt: Date | null) { const { db } = await getMongo(); await db.collection<Asset>("assets").updateOne({ id }, { $set: { expiresAt, updatedAt: new Date() } }); }
export async function deleteAsset(id: number) { const { db, bucket } = await getMongo(); const asset = await db.collection<Asset>("assets").findOne({ id }); if (!asset) return false; if (asset.storageKey) await bucket.delete(new ObjectId(asset.storageKey)).catch(() => undefined); await db.collection<Asset>("assets").deleteOne({ id }); return true; }
export async function deleteService(id: number) { const { db } = await getMongo(); const result = await db.collection("services").deleteOne({ id }); return result.deletedCount === 1; }
export async function purgeExpiredAssets() { const { db, bucket } = await getMongo(); const expired = await db.collection<Asset>("assets").find({ expiresAt: { $lte: new Date() } }).toArray(); for (const asset of expired) { if (asset.storageKey) await bucket.delete(new ObjectId(asset.storageKey)).catch(() => undefined); } if (expired.length) await db.collection("assets").deleteMany({ id: { $in: expired.map(asset => asset.id) } }); return expired.length; }
export async function setAssetPublished(id: number, published: boolean) { const { db } = await getMongo(); await db.collection("assets").updateOne({ id }, { $set: { published: published ? 1 : 0, updatedAt: new Date() } }); }
export async function storeFile(filename: string, data: Buffer, contentType: string) { const { bucket } = await getMongo(); const upload = bucket.openUploadStream(filename, { metadata: { contentType } }); await new Promise<void>((resolve, reject) => { upload.once("finish", () => resolve()); upload.once("error", reject); upload.end(data); }); return String(upload.id); }
export async function readFile(storageKey: string) { const { bucket } = await getMongo(); const chunks: Buffer[] = []; await new Promise<void>((resolve, reject) => { const stream = bucket.openDownloadStream(new ObjectId(storageKey)); stream.on("data", chunk => chunks.push(Buffer.from(chunk))); stream.once("end", () => resolve()); stream.once("error", reject); }); return Buffer.concat(chunks); }
