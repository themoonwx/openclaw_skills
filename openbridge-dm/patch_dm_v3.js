/**
 * Discord DM 补丁脚本 v3 - 简化版
 * 直接在 handleMessage 开头处理 DM，使用独立的 project
 */

const fs = require("fs");
const path = require("path");

const discordAdapterPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js"
);

console.log("[DM Patch v3] 目标文件:", discordAdapterPath);

let content = fs.readFileSync(discordAdapterPath, "utf8");

// 1. 添加 DirectMessages Intent
console.log("[DM Patch v3] 1. 添加 DirectMessages Intent...");
if (!content.includes("GatewayIntentBits.DirectMessages")) {
    content = content.replace(
        "GatewayIntentBits.GuildMessages,",
        "GatewayIntentBits.GuildMessages,\n            GatewayIntentBits.DirectMessages,"
    );
    console.log("  ✓ 已添加 DirectMessages Intent");
}

// 2. 在 handleMessage 函数开头添加 DM 处理
console.log("[DM Patch v3] 2. 添加 DM 处理逻辑...");

const dmCode = `
// DM/Group DM 处理 (DM=1, GroupDM=3, GUILD_PRIVATE_THREAD=11)
const msgChannelType = message.channel.type;
if (msgChannelType === 1 || msgChannelType === 3 || msgChannelType === 11) {
    console.log("[DM] 收到私信/群聊, type:", msgChannelType, "channel:", message.channel.id);
    const dmChannelId = message.channel.id;
    const dmThreadId = dmChannelId;

    // 为 DM 创建独立项目（不复用服务器项目）
    let project = this.store.getProjectByChannelId(dmChannelId);
    if (!project) {
        // 创建新项目，使用独立目录
        const dmProjectDir = "/home/ubuntu/workspace/dm";
        project = this.store.createProject(dmChannelId, dmProjectDir, "claude", "discord");
        console.log("[DM] 已创建独立项目:", dmProjectDir);
    }

    // React 确认
    await this.reactSeen(message);

    // 处理附件
    if (message.attachments.size > 0) {
        const files = Array.from(message.attachments.values()).map(a => ({name: a.name ?? "unknown", url: a.url, contentType: a.contentType}));
        await this.handleFileUpload(dmChannelId, dmThreadId, files, text, message);
        return;
    }

    // 发送消息到 router（先清除旧 session）
    this.store.updateBackendSessionId(dmThreadId, null);
    await this.router.send(dmChannelId, dmThreadId, text, undefined, undefined);
    console.log("[DM] 已发送消息到 router");
    return;
}
`;

// 在 handleMessage 函数开头，在 "if (message.author.bot)" 之前插入 DM 处理
const targetPattern = `async handleMessage(message) {
        // Ignore bot messages`;

if (content.includes(targetPattern)) {
    content = content.replace(targetPattern, "async handleMessage(message) {\n" + dmCode + "        // Ignore bot messages");
    console.log("  ✓ 已添加 DM 处理逻辑");
} else {
    console.log("  ✗ 未找到插入点");
}

// 保存
fs.writeFileSync(discordAdapterPath, content);
console.log("[DM Patch v3] 完成！");
