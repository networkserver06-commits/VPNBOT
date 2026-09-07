export const ENV = {
  mongodbUri: process.env.MONGODB_URI ?? "",
  mongodbDatabase: process.env.MONGODB_DATABASE ?? "leetec_vpn_bot",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAdminUserId: process.env.TELEGRAM_ADMIN_USER_ID ?? "",
  courtneyBaseUrl: process.env.COURTNEY_BASE_URL ?? "https://courtneytech.xyz/api",
  courtneyApiKey: process.env.COURTNEY_API_KEY ?? "",
  courtneyApiSecret: process.env.COURTNEY_API_SECRET ?? "",
  courtneyAccountId: Number(process.env.COURTNEY_ACCOUNT_ID ?? 0),
  publicAppUrl: (process.env.PUBLIC_APP_URL ?? "").replace(/\/+$/, ""),
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "LeeTechadmin_Bot",
};
export function missingEnv() { return [["MONGODB_URI", ENV.mongodbUri], ["TELEGRAM_BOT_TOKEN", ENV.telegramBotToken], ["TELEGRAM_ADMIN_USER_ID", ENV.telegramAdminUserId], ["COURTNEY_API_KEY", ENV.courtneyApiKey], ["COURTNEY_API_SECRET", ENV.courtneyApiSecret], ["COURTNEY_ACCOUNT_ID", ENV.courtneyAccountId], ["PUBLIC_APP_URL", ENV.publicAppUrl]].filter(([, value]) => !value).map(([name]) => name); }
