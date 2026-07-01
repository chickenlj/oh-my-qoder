import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

type RawConfig = Record<string, unknown> | null;

const VALID_DISCORD_USER_ID = "123456789012345678";
const ORIGINAL_ENV = process.env;

function mockConfigFile(rawConfig: RawConfig): void {
  vi.doMock("fs", () => ({
    existsSync: vi.fn(() => rawConfig !== null),
    readFileSync: vi.fn(() => JSON.stringify(rawConfig ?? {})),
  }));
}

describe("reply config", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.OMQ_REPLY_ENABLED;
    delete process.env.OMQ_REPLY_POLL_INTERVAL_MS;
    delete process.env.OMQ_REPLY_RATE_LIMIT;
    delete process.env.OMQ_REPLY_DISCORD_USER_IDS;
    delete process.env.OMQ_REPLY_INCLUDE_PREFIX;
    delete process.env.OMQ_DISCORD_NOTIFIER_BOT_TOKEN;
    delete process.env.OMQ_DISCORD_NOTIFIER_CHANNEL;
    delete process.env.OMQ_DISCORD_WEBHOOK_URL;
    delete process.env.OMQ_DISCORD_MENTION;
    delete process.env.OMQ_TELEGRAM_BOT_TOKEN;
    delete process.env.OMQ_TELEGRAM_NOTIFIER_BOT_TOKEN;
    delete process.env.OMQ_TELEGRAM_CHAT_ID;
    delete process.env.OMQ_TELEGRAM_NOTIFIER_CHAT_ID;
    delete process.env.OMQ_TELEGRAM_NOTIFIER_UID;
    delete process.env.OMQ_SLACK_WEBHOOK_URL;
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("enables reply config when reply-capable platform exists only at event level", async () => {
    mockConfigFile({
      notifications: {
        enabled: true,
        events: {
          "ask-user-question": {
            telegram: {
              enabled: true,
              botToken: "tg-token-event",
              chatId: "tg-chat-event",
            },
          },
        },
        reply: {
          enabled: true,
          rateLimitPerMinute: 12,
        },
      },
    });

    const {
      getReplyConfig,
      getNotificationConfig,
      getReplyListenerPlatformConfig,
    } = await import("../config.js");

    const replyConfig = getReplyConfig();
    expect(replyConfig).not.toBeNull();
    expect(replyConfig?.rateLimitPerMinute).toBe(12);

    const notifConfig = getNotificationConfig();
    const runtime = getReplyListenerPlatformConfig(notifConfig);
    expect(runtime.telegramBotToken).toBe("tg-token-event");
    expect(runtime.telegramChatId).toBe("tg-chat-event");
  });

  it("returns null when reply is enabled but no reply-capable platform is configured", async () => {
    mockConfigFile({
      notifications: {
        enabled: true,
        discord: {
          enabled: true,
          webhookUrl: "https://discord.com/api/webhooks/abc/123",
        },
        reply: {
          enabled: true,
        },
      },
    });

    const { getReplyConfig } = await import("../config.js");
    expect(getReplyConfig()).toBeNull();
  });

  it("warns when discord-bot is enabled but authorizedDiscordUserIds is empty", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    mockConfigFile({
      notifications: {
        enabled: true,
        "discord-bot": {
          enabled: true,
          botToken: "discord-token",
          channelId: "discord-channel",
        },
        reply: {
          enabled: true,
        },
      },
    });

    const { getReplyConfig } = await import("../config.js");
    const replyConfig = getReplyConfig();

    expect(replyConfig).not.toBeNull();
    expect(replyConfig?.authorizedDiscordUserIds).toEqual([]);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it("applies environment overrides for reply settings and discord user IDs", async () => {
    process.env.OMQ_REPLY_POLL_INTERVAL_MS = "5000";
    process.env.OMQ_REPLY_RATE_LIMIT = "20";
    process.env.OMQ_REPLY_INCLUDE_PREFIX = "false";
    process.env.OMQ_REPLY_DISCORD_USER_IDS = `${VALID_DISCORD_USER_ID},invalid-id`;

    mockConfigFile({
      notifications: {
        enabled: true,
        "discord-bot": {
          enabled: true,
          botToken: "discord-token",
          channelId: "discord-channel",
        },
        reply: {
          enabled: true,
          pollIntervalMs: 1000,
          rateLimitPerMinute: 5,
          includePrefix: true,
          authorizedDiscordUserIds: ["999999999999999999"],
        },
      },
    });

    const { getReplyConfig } = await import("../config.js");
    const replyConfig = getReplyConfig();

    expect(replyConfig).not.toBeNull();
    expect(replyConfig?.pollIntervalMs).toBe(5000);
    expect(replyConfig?.rateLimitPerMinute).toBe(20);
    expect(replyConfig?.includePrefix).toBe(false);
    expect(replyConfig?.authorizedDiscordUserIds).toEqual([
      VALID_DISCORD_USER_ID,
    ]);
  });

  it("returns discordMention from top-level discord-bot config", async () => {
    mockConfigFile({
      notifications: {
        enabled: true,
        "discord-bot": {
          enabled: true,
          botToken: "discord-token",
          channelId: "discord-channel",
          mention: "<@123456789012345678>",
        },
        reply: {
          enabled: true,
          authorizedDiscordUserIds: [VALID_DISCORD_USER_ID],
        },
      },
    });

    const { getNotificationConfig, getReplyListenerPlatformConfig } =
      await import("../config.js");
    const notifConfig = getNotificationConfig();
    const runtime = getReplyListenerPlatformConfig(notifConfig);

    expect(runtime.discordMention).toBe("<@123456789012345678>");
  });

  it("returns discordMention from env var OMQ_DISCORD_MENTION", async () => {
    process.env.OMQ_DISCORD_NOTIFIER_BOT_TOKEN = "env-token";
    process.env.OMQ_DISCORD_NOTIFIER_CHANNEL = "env-channel";
    process.env.OMQ_DISCORD_MENTION = "<@987654321098765432>";

    mockConfigFile(null);

    const { getNotificationConfig, getReplyListenerPlatformConfig } =
      await import("../config.js");
    const notifConfig = getNotificationConfig();
    const runtime = getReplyListenerPlatformConfig(notifConfig);

    expect(runtime.discordMention).toBe("<@987654321098765432>");
  });

  it("returns undefined discordMention when no mention is configured", async () => {
    mockConfigFile({
      notifications: {
        enabled: true,
        "discord-bot": {
          enabled: true,
          botToken: "discord-token",
          channelId: "discord-channel",
        },
        reply: {
          enabled: true,
          authorizedDiscordUserIds: [VALID_DISCORD_USER_ID],
        },
      },
    });

    const { getNotificationConfig, getReplyListenerPlatformConfig } =
      await import("../config.js");
    const notifConfig = getNotificationConfig();
    const runtime = getReplyListenerPlatformConfig(notifConfig);

    expect(runtime.discordMention).toBeUndefined();
  });

  it("resolves discord credentials from event-level config and falls back to top-level tokens", async () => {
    mockConfigFile({
      notifications: {
        enabled: true,
        "discord-bot": {
          enabled: false,
          botToken: "top-level-token",
          channelId: "top-level-channel",
        },
        events: {
          "session-end": {
            "discord-bot": {
              enabled: true,
            },
          },
        },
        reply: {
          enabled: true,
          authorizedDiscordUserIds: [VALID_DISCORD_USER_ID],
        },
      },
    });

    const { getNotificationConfig, getReplyListenerPlatformConfig } = await import(
      "../config.js"
    );
    const notifConfig = getNotificationConfig();
    const runtime = getReplyListenerPlatformConfig(notifConfig);

    expect(runtime.discordBotToken).toBe("top-level-token");
    expect(runtime.discordChannelId).toBe("top-level-channel");
  });
});
