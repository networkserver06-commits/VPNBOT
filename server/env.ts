export const ENV = {
  mongodbUri: process.env.MONGODB_URI ?? "",
  mongodbDatabase: process.env.MONGODB_DATABASE ?? "leetec_vpn_bot",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
  telegramAdminUserId: process.env.TELEGRAM_ADMIN_USER_ID ?? "",
  leetecApiKey: process.env.LEETEC_API_KEY ?? "",
  leetecTillId: process.env.LEETEC_TILL_ID ? Number(process.env.LEETEC_TILL_ID) : undefined,
  leetecStatusUrl: process.env.LEETEC_STATUS_URL ?? "",
  publicAppUrl: (process.env.PUBLIC_APP_URL ?? "").replace(/\/+$/, ""),
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME ?? "LeeTechadmin_Bot",
};
export function missingEnv() { return [["MONGODB_URI", ENV.mongodbUri], ["TELEGRAM_BOT_TOKEN", ENV.telegramBotToken], ["TELEGRAM_ADMIN_USER_ID", ENV.telegramAdminUserId], ["LEETEC_API_KEY", ENV.leetecApiKey], ["PUBLIC_APP_URL", ENV.publicAppUrl]].filter(([, value]) => !value).map(([name]) => name); }
