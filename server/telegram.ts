import type { Express } from "express";
import { createHash } from "node:crypto";
import { createAsset, createService, getAsset, listAssets, listServices, upsertTelegramSubscriber } from "./db";
import { ENV } from "./_core/env";
import { storageGetSignedUrl, storagePut } from "./storage";

type TelegramUser = { id: number; username?: string; first_name?: string };
type TelegramChat = { id: number };
type TelegramDocument = { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
type TelegramMessage = {
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  document?: TelegramDocument;
};
type TelegramUpdate = { message?: TelegramMessage };

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

function requireTelegramConfig() {
  if (!ENV.telegramBotToken || !ENV.telegramAdminUserId) {
    throw new Error("Telegram bot secrets are not configured");
  }
  return { token: ENV.telegramBotToken, adminId: ENV.telegramAdminUserId };
}

function webhookSecret() {
  return createHash("sha256").update(ENV.telegramBotToken).digest("hex").slice(0, 48);
}

async function telegramApi<T>(method: string, body: Record<string, unknown>) {
  const { token } = requireTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.description ?? `Telegram ${method} failed`);
  }
  return payload.result as T;
}

async function sendMessage(chatId: number, text: string) {
  return telegramApi("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

function isAdmin(user?: TelegramUser) {
  return Boolean(user && String(user.id) === ENV.telegramAdminUserId);
}

function formatAssetList(items: Awaited<ReturnType<typeof listAssets>>) {
  if (!items.length) return "No shared files or configs have been published yet.";
  return items
    .map((item, index) => `${index + 1}. ${item.title} · ${item.category}${item.kind === "config" ? " [config]" : " [file]"}`)
    .join("\n");
}

function formatServiceList(items: Awaited<ReturnType<typeof listServices>>) {
  if (!items.length) return "No tech services have been published yet.";
  return items
    .map(item => `${item.title} · ${item.category}\n${item.description}${item.url ? `\n${item.url}` : ""}`)
    .join("\n\n");
}

async function sendAsset(chatId: number, id: number) {
  const asset = await getAsset(id);
  if (!asset || asset.published !== 1) return;

  if (asset.kind === "config") {
    const body = asset.contentText ?? "(empty config)";
    const content = `${asset.title}\n\n${body}`;
    await sendMessage(chatId, content.slice(0, 3900));
    return;
  }

  if (asset.storageKey) {
    const url = await storageGetSignedUrl(asset.storageKey);
    await telegramApi("sendDocument", {
      chat_id: chatId,
      document: url,
      caption: asset.title,
    });
  }
}

async function sendPublishedAssets(chatId: number) {
  const assets = await listAssets();
  if (!assets.length) {
    await sendMessage(chatId, "No shared files or configs have been published yet.");
    return;
  }
  await sendMessage(chatId, `Available files and configs:\n\n${formatAssetList(assets)}`);
  for (const asset of assets) await sendAsset(chatId, asset.id);
}

async function handleAdminText(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const [command, ...rest] = text.trim().split(/\s+/);
  const argument = rest.join(" ").trim();

  if (command === "/service") {
    const parts = argument.split("|").map(part => part.trim());
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) {
      await sendMessage(chatId, "Usage: /service Title | Category | Description | https://optional-link");
      return;
    }
    await createService({
      title: parts[0],
      category: parts[1],
      description: parts[2],
      url: parts[3] || null,
      published: 1,
    });
    await sendMessage(chatId, `Published service: ${parts[0]}`);
    return;
  }

  if (command === "/addconfig") {
    const newline = argument.indexOf("\n");
    if (newline < 1) {
      await sendMessage(chatId, "Usage: /addconfig Category | Title then a new line with the config content");
      return;
    }
    const header = argument.slice(0, newline).trim();
    const [categoryPart, titlePart] = header.split("|").map(part => part.trim());
    const category = titlePart ? categoryPart || "General" : "General";
    const title = titlePart || categoryPart;
    const content = argument.slice(newline + 1).trim();
    await createAsset({ kind: "config", title, category, contentText: content, published: 1 });
    await sendMessage(chatId, `Published config: ${title}`);
    return;
  }

  if (command === "/send") {
    const id = Number(argument);
    if (!Number.isInteger(id)) {
      await sendMessage(chatId, "Usage: /send asset-id");
      return;
    }
    await sendAsset(chatId, id);
    return;
  }
}

async function handleDocument(message: TelegramMessage) {
  if (!message.document || !isAdmin(message.from)) return;
  const caption = message.caption?.trim() ?? "";
  if (!caption.toLowerCase().startsWith("/add")) return;

  const chatId = message.chat.id;
  const { token } = requireTelegramConfig();
  const fileInfo = await telegramApi<{ file_path?: string }>("getFile", { file_id: message.document.file_id });
  if (!fileInfo.file_path) throw new Error("Telegram did not return a file path");
  if ((message.document.file_size ?? 0) > 20 * 1024 * 1024) {
    await sendMessage(chatId, "This bot accepts files up to 20 MB from Telegram.");
    return;
  }

  const response = await fetch(`https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`);
  if (!response.ok) throw new Error("Could not download the Telegram file");
  const buffer = Buffer.from(await response.arrayBuffer());
  const header = caption.replace(/^\/add\s*/i, "").trim();
  const [categoryPart, titlePart] = header.split("|").map(part => part.trim());
  const category = titlePart ? categoryPart || "General" : "General";
  const title = (titlePart || categoryPart || message.document.file_name || "Shared file").trim();
  const stored = await storagePut(`telegram-assets/${message.document.file_name ?? title}`, buffer, message.document.mime_type ?? "application/octet-stream");
  const id = await createAsset({
    kind: "file",
    title,
    category,
    fileName: message.document.file_name ?? null,
    mimeType: message.document.mime_type ?? null,
    storageKey: stored.key,
    sizeBytes: message.document.file_size ?? buffer.length,
    published: 1,
  });
  await sendMessage(chatId, `Published file #${id}: ${title}`);
}

async function handleMessage(message: TelegramMessage) {
  const user = message.from;
  if (user) {
    await upsertTelegramSubscriber({
      telegramUserId: String(user.id),
      username: user.username,
      firstName: user.first_name,
    });
  }

  const chatId = message.chat.id;
  if (message.document) {
    await handleDocument(message);
    return;
  }

  const text = message.text?.trim() ?? "";
  if (!text) return;

  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      "TechVault\n\nUse /files to receive published files and VPN configs.\nUse /services to browse tech services.\nUse /help to see this message again.",
    );
    if (isAdmin(user)) {
      await sendMessage(chatId, "Admin commands:\n/addconfig Category | Title then config text\n/add Category | Title (as a document caption)\n/service Title | Category | Description | URL\n/send asset-id");
    }
    return;
  }
  if (text === "/files") {
    await sendPublishedAssets(chatId);
    return;
  }
  if (text === "/services") {
    await sendMessage(chatId, formatServiceList(await listServices()));
    return;
  }
  if (isAdmin(user) && text.startsWith("/")) {
    await handleAdminText(message, text);
  }
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  if (update.message) {
    try {
      await handleMessage(update.message);
    } catch (error) {
      console.error("[Telegram] update failed:", error);
      if (update.message.chat?.id) {
        await sendMessage(update.message.chat.id, "Something went wrong while processing that request. Please try again.").catch(() => undefined);
      }
    }
  }
}

export async function setTelegramWebhook(webhookUrl: string) {
  await telegramApi("setWebhook", { url: webhookUrl, secret_token: webhookSecret(), drop_pending_updates: true });
  return { webhookUrl };
}

export function registerTelegramWebhook(app: Express) {
  app.post("/api/telegram/webhook", (req, res) => {
    const expected = webhookSecret();
    if (req.header("x-telegram-bot-api-secret-token") !== expected) {
      res.status(403).json({ ok: false });
      return;
    }
    res.status(200).json({ ok: true });
    void processTelegramUpdate(req.body as TelegramUpdate);
  });

  app.get("/api/telegram/health", (_req, res) => {
    res.json({ ok: Boolean(ENV.telegramBotToken && ENV.telegramAdminUserId), service: "telegram" });
  });
}
