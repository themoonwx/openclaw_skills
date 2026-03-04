/**
 * Discord DM 补丁脚本 v2
 * 只修改 handleMessage 函数，添加 DM 支持
 */

const fs = require("fs");
const path = require("path");

const discordAdapterPath = path.join(
    process.env.HOME || process.env.USERPROFILE,
    ".npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js"
);

console.log("[DM Patch v2] 目标文件:", discordAdapterPath);

let content = fs.readFileSync(discordAdapterPath, "utf8");

// 1. 添加 DirectMessages Intent
console.log("[DM Patch v2] 1. 添加 DirectMessages Intent...");
if (!content.includes("GatewayIntentBits.DirectMessages")) {
    content = content.replace(
        "GatewayIntentBits.GuildMessages,",
        "GatewayIntentBits.GuildMessages,\n            GatewayIntentBits.DirectMessages,"
    );
    console.log("  ✓ 已添加 DirectMessages Intent");
}

// 2. 只修改 handleMessage 函数中的第一处 project 检查
console.log("[DM Patch v2] 2. 添加 DM 处理逻辑...");

const dmCode = `
// DM 处理 (DM=1, GroupDM=3, GroupDM2=11)
const channelType = message.channel.type;
if (channelType === 1 || channelType === 3 || channelType === 11) {
    console.log("[DM] 收到私信/群聊, channel:", message.channel.id);
    const dmChannelId = message.channel.id;
    const dmThreadId = dmChannelId;
    let project = this.store.getProjectByChannelId(dmChannelId);
    if (!project) {
        const projects = this.store.getAllProjects();
        if (projects.length > 0) {
            project = projects[0];
            this.store.setProjectForChannel(dmChannelId, project.project_dir, project.platform);
            console.log("[DM] 已绑定项目:", project.name);
        } else {
            await message.reply("请先在服务器绑定项目");
            return;
        }
    }
    await this.reactSeen(message);
    if (message.attachments.size > 0) {
        const files = Array.from(message.attachments.values()).map(a => ({name: a.name ?? "unknown", url: a.url, contentType: a.contentType}));
        await this.handleFileUpload(dmChannelId, dmThreadId, files, text, message);
        return;
    }
    await this.router.send({platform: "discord", channelId: dmChannelId, threadId: dmThreadId, messageId: message.id, message: text, userId: message.author.id});
    return;
}
`;

// 找到 handleMessage 函数中第一个 project 检查
// 匹配模式：注释 + project 获取
const pattern = /(\/\/ Check if this channel is bound to a project\s+const project = this\.store\.getProjectByChannelId\(channelId\);)/;

if (content.match(pattern)) {
    content = content.replace(pattern, dmCode + "$1");
    console.log("  ✓ 已添加 DM 处理逻辑");
} else {
    console.log("  ✗ 未找到插入点");
}

// 保存
fs.writeFileSync(discordAdapterPath, content);
console.log("[DM Patch v2] 完成！");
