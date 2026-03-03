/**
 * Discord DM 补丁脚本
 * 通过 monkey-patch 方式为 OpenBridge 添加私信支持
 *
 * 使用方法: node patch-discord.js
 */

const fs = require("fs");
const path = require("path");

const discordAdapterPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js"
);

console.log("[DM Patch] 目标文件:", discordAdapterPath);

let content = fs.readFileSync(discordAdapterPath, "utf8");
const originalContent = content;

// 1. 添加 DirectMessages 意图
console.log("[DM Patch] 1. 添加 DirectMessages 意图...");
if (!content.includes("GatewayIntentBits.DirectMessages")) {
    content = content.replace(
        "GatewayIntentBits.GuildMessages,",
        "GatewayIntentBits.GuildMessages,\n        GatewayIntentBits.DirectMessages,\n        GatewayIntentBits.DirectMessageReactions,"
    );
    console.log("[DM Patch]   ✓ 已添加 DirectMessages 意图");
} else {
    console.log("[DM Patch]   ✓ 已存在，跳过");
}

// 2. 确保包含 MessageContent 意图
console.log("[DM Patch] 2. 检查消息内容意图...");
if (!content.includes("GatewayIntentBits.MessageContent")) {
    content = content.replace(
        "GatewayIntentBits.GuildMessages,",
        "GatewayIntentBits.GuildMessages,\n        GatewayIntentBits.MessageContent,"
    );
    console.log("[DM Patch]   ✓ 已添加 MessageContent 意图");
} else {
    console.log("[DM Patch]   ✓ MessageContent 已存在");
}

// 3. 修改 handleMessage 函数 - 添加 DM 处理逻辑
console.log("[DM Patch] 3. 修改消息处理逻辑...");

const dmHandler = `
// 检查是否为私信 (DM)
const isDM = message.channel.type === 1; // ChannelType.DM = 1
const isGroupDM = message.channel.type === 3; // ChannelType.GroupDM = 3

if (isDM || isGroupDM) {
    // 私信模式：将 channelId 作为 threadId
    const dmChannelId = message.channel.id;
    const dmThreadId = dmChannelId; // DM 中 channel 即 thread

    // 检查是否已绑定项目，如果没有则使用默认项目
    let project = this.store.getProjectByChannelId(dmChannelId);
    if (!project) {
        // 尝试获取默认项目
        const projects = this.store.getAllProjects();
        if (projects.length > 0) {
            project = projects[0];
            // 为 DM 频道绑定项目
            this.store.setProjectForChannel(dmChannelId, project.project_dir, project.platform);
            console.log("[discord DM] 已绑定项目:", project.name);
        } else {
            // 没有项目，返回提示
            await message.reply("请先在服务器频道绑定项目后再使用私信功能");
            return;
        }
    }

    const threadId = dmThreadId;

    // React with 👀 to acknowledge
    await this.reactSeen(message);

    // 处理文件附件
    if (message.attachments.size > 0) {
        const files = Array.from(message.attachments.values()).map((a) => ({
            name: a.name ?? "unknown",
            url: a.url,
            contentType: a.contentType ?? undefined,
        }));
        await this.handleFileUpload(dmChannelId, threadId, files, text, message);
        return;
    }

    // 发送消息到 router
    await this.router.send({
        platform: "discord",
        channelId: dmChannelId,
        threadId: threadId,
        messageId: message.id,
        message: text,
        userId: message.author.id,
    });

    return;
}
`;

// 在 "const project = this.store.getProjectByChannelId(channelId);" 之后添加 DM 处理
const oldCheck = `// Check if this channel is bound to a project
        const project = this.store.getProjectByChannelId(channelId);`;

if (content.includes(oldCheck) && !content.includes("isDM = message.channel.type")) {
    content = content.replace(oldCheck, dmHandler);
    console.log("[DM Patch]   ✓ 已添加 DM 处理逻辑");
} else if (content.includes("isDM = message.channel.type")) {
    console.log("[DM Patch]   ✓ DM 处理逻辑已存在");
} else {
    console.log("[DM Patch]   ✗ 未找到插入点，跳过");
}

// 保存修改后的文件
fs.writeFileSync(discordAdapterPath, content);
console.log("[DM Patch] 完成！");
console.log("[DM Patch] 请重启 OpenBridge 测试");
