import type { Express } from "express";
import { createHash } from "node:crypto";
import { createAsset, createService, getAsset, listAssets, listServices, upsertTelegramSubscriber } from "./db";
import { ENV } from "./_core/env";
import { storageGetSignedUrl, storagePut } from "./storage";

type TelegramUser = { id: number; username?: string; first_name?: string };
type TelegramChat = { id: number };
type TelegramDocument = { file_id: string; file_name?: string; mime_type?: string; file_size?: number };
type TelegramMessage = { chat: TelegramChat; message_id?: number; from?: TelegramUser; text?: string; caption?: string; document?: TelegramDocument };
type TelegramCallbackQuery = { id: string; data?: string; from: TelegramUser; message?: TelegramMessage };
type TelegramUpdate = { message?: TelegramMessage; callback_query?: TelegramCallbackQuery };
type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };
type InlineKeyboard = { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };

const uploadMode = new Set<string>();

function requireTelegramConfig() {
  if (!ENV.telegramBotToken || !ENV.telegramAdminUserId) throw new Error("Telegram bot secrets are not configured");
  return { token: ENV.telegramBotToken, adminId: ENV.telegramAdminUserId };
}
function webhookSecret() { return createHash("sha256").update(ENV.telegramBotToken).digest("hex").slice(0, 48); }
async function telegramApi<T>(method: string, body: Record<string, unknown>) {
  const { token } = requireTelegramConfig();
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = (await response.json()) as TelegramResponse<T>;
  if (!response.ok || !payload.ok) throw new Error(payload.description ?? `Telegram ${method} failed`);
  return payload.result as T;
}
async function sendMessage(chatId: number, text: string, reply_markup?: InlineKeyboard) { return telegramApi("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true, reply_markup }); }
async function editMessage(chatId: number, messageId: number, text: string, reply_markup?: InlineKeyboard) { return telegramApi("editMessageText", { chat_id: chatId, message_id: messageId, text, disable_web_page_preview: true, reply_markup }); }
async function answerCallback(id: string) { return telegramApi("answerCallbackQuery", { callback_query_id: id }); }
function isAdmin(user?: TelegramUser) { return Boolean(user && String(user.id) === ENV.telegramAdminUserId); }

function mainMenu(admin = false): InlineKeyboard {
  const rows = [
    [{ text: "📦 Files & configs", callback_data: "tab:files" }, { text: "🛠 Tech services", callback_data: "tab:services" }],
    [{ text: "🏠 Home", callback_data: "tab:home" }, { text: "💳 Payments", callback_data: "tab:payments" }],
  ];
  if (admin) rows.push([{ text: "⬆️ Upload files", callback_data: "admin:upload" }, { text: "⚙️ Admin help", callback_data: "admin:help" }]);
  return { inline_keyboard: rows };
}
function backMenu(admin = false): InlineKeyboard { return { inline_keyboard: [[{ text: "⬅️ Back to menu", callback_data: "tab:home" }], ...(admin ? [[{ text: "⬆️ Upload more files", callback_data: "admin:upload" }]] : [])] }; }

function formatAssetList(items: Awaited<ReturnType<typeof listAssets>>) {
  if (!items.length) return "No shared files or configs have been published yet.";
  return items.map((item, index) => `${index + 1}. ${item.title} · ${item.category}${item.kind === "config" ? " [config]" : " [file]"}`).join("\n");
}
function formatServiceList(items: Awaited<ReturnType<typeof listServices>>) {
  if (!items.length) return "No tech services have been published yet.";
  return items.map(item => `${item.title} · ${item.category}\n${item.description}${item.url ? `\n${item.url}` : ""}`).join("\n\n");
}

async function sendAsset(chatId: number, id: number) {
  const asset = await getAsset(id);
  if (!asset || asset.published !== 1) return;
  if (asset.kind === "config") { await sendMessage(chatId, `${asset.title} · ${asset.category}\n\n${(asset.contentText ?? "(empty config)").slice(0, 3800)}`); return; }
  if (asset.storageKey) await telegramApi("sendDocument", { chat_id: chatId, document: await storageGetSignedUrl(asset.storageKey), caption: `${asset.title} · ${asset.category}` });
}
async function sendPublishedAssets(chatId: number, admin = false) {
  const assets = await listAssets();
  await sendMessage(chatId, assets.length ? `📦 Available files and configs:\n\n${formatAssetList(assets)}` : "No shared files or configs have been published yet.", backMenu(admin));
  for (const asset of assets) await sendAsset(chatId, asset.id);
}
async function showHome(chatId: number, admin = false, messageId?: number) {
  const text = "LEETECH VPN BOT\n\nChoose a tab below to browse VPN configs, files, and tech services.";
  if (messageId) await editMessage(chatId, messageId, text, mainMenu(admin)); else await sendMessage(chatId, text, mainMenu(admin));
}

async function handleAdminText(message: TelegramMessage, text: string) {
  const chatId = message.chat.id;
  const [command, ...rest] = text.trim().split(/\s+/);
  const argument = rest.join(" ").trim();
  if (command === "/upload") { uploadMode.add(String(message.from?.id)); await sendMessage(chatId, "Upload mode is active. Send one or more files now. Add a caption like `Category | Title` to each file, then tap Done.", { inline_keyboard: [[{ text: "✅ Done uploading", callback_data: "admin:done" }], [{ text: "⬅️ Main menu", callback_data: "tab:home" }]] }); return; }
  if (command === "/service") {
    const parts = argument.split("|").map(part => part.trim());
    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) { await sendMessage(chatId, "Usage: /service Title | Category | Description | https://optional-link"); return; }
    await createService({ title: parts[0], category: parts[1], description: parts[2], url: parts[3] || null, published: 1 });
    await sendMessage(chatId, `Published service: ${parts[0]}`, mainMenu(true)); return;
  }
  if (command === "/addconfig") {
    const newline = argument.indexOf("\n");
    if (newline < 1) { await sendMessage(chatId, "Usage: /addconfig Category | Title then a new line with the config content"); return; }
    const header = argument.slice(0, newline).trim(); const [categoryPart, titlePart] = header.split("|").map(part => part.trim());
    const category = titlePart ? categoryPart || "General" : "General"; const title = titlePart || categoryPart; const content = argument.slice(newline + 1).trim();
    await createAsset({ kind: "config", title, category, contentText: content, published: 1 });
    await sendMessage(chatId, `Published config: ${title}`, mainMenu(true)); return;
  }
  if (command === "/send") { const id = Number(argument); if (!Number.isInteger(id)) { await sendMessage(chatId, "Usage: /send asset-id"); return; } await sendAsset(chatId, id); }
}

async function handleDocument(message: TelegramMessage) {
  if (!message.document || !isAdmin(message.from)) return;
  const adminId = String(message.from?.id); const caption = message.caption?.trim() ?? "";
  if (!uploadMode.has(adminId) && !caption.toLowerCase().startsWith("/add")) return;
  const chatId = message.chat.id; const { token } = requireTelegramConfig();
  const fileInfo = await telegramApi<{ file_path?: string }>("getFile", { file_id: message.document.file_id });
  if (!fileInfo.file_path) throw new Error("Telegram did not return a file path");
  if ((message.document.file_size ?? 0) > 20 * 1024 * 1024) { await sendMessage(chatId, "This bot accepts files up to 20 MB from Telegram."); return; }
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${fileInfo.file_path}`); if (!response.ok) throw new Error("Could not download the Telegram file");
  const buffer = Buffer.from(await response.arrayBuffer()); const header = caption.replace(/^\/add\s*/i, "").trim(); const [categoryPart, titlePart] = header.split("|").map(part => part.trim());
  const category = titlePart ? categoryPart || "General" : "General"; const title = (titlePart || categoryPart || message.document.file_name || "Shared file").trim();
  const stored = await storagePut(`telegram-assets/${message.document.file_name ?? title}`, buffer, message.document.mime_type ?? "application/octet-stream");
  const id = await createAsset({ kind: "file", title, category, fileName: message.document.file_name ?? null, mimeType: message.document.mime_type ?? null, storageKey: stored.key, sizeBytes: message.document.file_size ?? buffer.length, published: 1 });
  await sendMessage(chatId, `✅ Uploaded file #${id}: ${title}\nCategory: ${category}\nSend another file or tap Done.`, { inline_keyboard: [[{ text: "✅ Done uploading", callback_data: "admin:done" }], [{ text: "⬅️ Main menu", callback_data: "tab:home" }]] });
}

async function handleCallback(query: TelegramCallbackQuery) {
  await answerCallback(query.id); const chatId = query.message?.chat.id; const messageId = query.message?.message_id; if (!chatId || !messageId) return;
  const admin = isAdmin(query.from); const data = query.data ?? "";
  if (data === "tab:home") return showHome(chatId, admin, messageId);
  if (data === "tab:files") { const assets = await listAssets(); return editMessage(chatId, messageId, assets.length ? `📦 Files & configs\n\n${formatAssetList(assets)}` : "No shared files or configs yet.", backMenu(admin)); }
  if (data === "tab:services") return editMessage(chatId, messageId, `🛠 Tech services\n\n${formatServiceList(await listServices())}`, backMenu(admin));
  if (data === "tab:payments") return editMessage(chatId, messageId, "💳 Payments\n\nPayment checkout will be enabled after the payment provider and CourtneyTech API details are connected.", backMenu(admin));
  if (data === "admin:upload" && admin) { uploadMode.add(String(query.from.id)); return editMessage(chatId, messageId, "⬆️ Upload mode is active. Send one or more files now. Use caption `Category | Title` for each file, then tap Done.", { inline_keyboard: [[{ text: "✅ Done uploading", callback_data: "admin:done" }], [{ text: "⬅️ Main menu", callback_data: "tab:home" }]] }); }
  if (data === "admin:done" && admin) { uploadMode.delete(String(query.from.id)); return editMessage(chatId, messageId, "Upload mode finished. Your files are published in the selected categories.", mainMenu(true)); }
  if (data === "admin:help" && admin) return editMessage(chatId, messageId, "⚙️ Admin commands\n\n/upload — start multi-file upload mode\n/add Category | Title — publish a document\n/addconfig Category | Title then config text\n/service Title | Category | Description | URL", backMenu(true));
}

async function handleMessage(message: TelegramMessage) {
  const user = message.from;
  if (user) await upsertTelegramSubscriber({ telegramUserId: String(user.id), username: user.username, firstName: user.first_name });
  const chatId = message.chat.id; if (message.document) { await handleDocument(message); return; }
  const text = message.text?.trim() ?? ""; if (!text) return;
  if (text === "/start" || text === "/help" || text === "/menu") { await showHome(chatId, isAdmin(user)); return; }
  if (text === "/files") { await sendPublishedAssets(chatId, isAdmin(user)); return; }
  if (text === "/services") { await sendMessage(chatId, formatServiceList(await listServices()), backMenu(isAdmin(user))); return; }
  if (isAdmin(user) && text.startsWith("/")) await handleAdminText(message, text);
}

export async function processTelegramUpdate(update: TelegramUpdate) {
  try { if (update.callback_query) await handleCallback(update.callback_query); else if (update.message) await handleMessage(update.message); }
  catch (error) { console.error("[Telegram] update failed:", error); if (update.message?.chat?.id) await sendMessage(update.message.chat.id, "Something went wrong while processing that request. Please try again.").catch(() => undefined); }
}

export async function configureTelegramMenu() {
  await telegramApi("setMyCommands", { commands: [{ command: "start", description: "Open the menu" }, { command: "menu", description: "Show menu tabs" }, { command: "files", description: "Browse files and configs" }, { command: "services", description: "Browse tech services" }, { command: "upload", description: "Admin: upload files" }] });
  await telegramApi("setChatMenuButton", { menu_button: { type: "commands" } });
}
export async function setTelegramWebhook(webhookUrl: string) { await telegramApi("setWebhook", { url: webhookUrl, secret_token: webhookSecret(), drop_pending_updates: true }); return { webhookUrl }; }

export function registerTelegramWebhook(app: Express) {
  app.post("/api/telegram/webhook", (req, res) => { if (req.header("x-telegram-bot-api-secret-token") !== webhookSecret()) { res.status(403).json({ ok: false }); return; } res.status(200).json({ ok: true }); void processTelegramUpdate(req.body as TelegramUpdate); });
  app.get("/api/telegram/health", (_req, res) => res.json({ ok: Boolean(ENV.telegramBotToken && ENV.telegramAdminUserId), service: "telegram" }));
}
