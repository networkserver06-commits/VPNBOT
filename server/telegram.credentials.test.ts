import { describe, expect, it } from "vitest";

describe("Telegram credentials", () => {
  it("can authenticate with BotFather using getMe", async () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    expect(token, "TELEGRAM_BOT_TOKEN must be configured").toBeTruthy();

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const body = (await response.json()) as { ok?: boolean; description?: string };

    expect(response.ok, body.description ?? "Telegram getMe failed").toBe(true);
    expect(body.ok, body.description ?? "Telegram token was rejected").toBe(true);
  }, 15_000);
});
