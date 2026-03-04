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

// 2. 修改 handleMessage 函数 - 在 project 检查前添加 DM 处理
console.log("[DM Patch] 2. 修改消息处理逻辑...");

// 在 "// Check if this channel is bound to a project" 之后、获取 project 之前插入 DM 处理代码
const dmCode = `
// Discord DM 处理 - 在 project 检查之前
const dmChannelType = message.channel.type;
if (dmChannelType === 1 || dmChannelType === 3) { // DM or GroupDM
    console.log('[discord DM] 收到私信:', message.channel.id);
    // 私信模式：channelId 就是 threadId
    const dmChannelId = message.channel.id;
    const dmThreadId = dmChannelId;

    // 获取或创建项目绑定
    let project = this.store.getProjectByChannelId(dmChannelId);
    if (!project) {
        // 尝试使用默认第一个项目
        const projects = this.store.getAllProjects();
        if (projects.length > 0) {
            project = projects[0];
            this.store.setProjectForChannel(dmChannelId, project.project_dir, project.platform);
            console.log('[discord DM] 绑定项目:', project.name);
        } else {
            await message.reply('请先在服务器频道使用 /project connect 绑定项目后再使用私信');
            return;
        }
    }

    // React 确认
    await this.reactSeen(message);

    // 处理附件
    if (message.attachments.size > 0) {
        const files = Array.from(message.attachments.values()).map(a => ({
            name: a.name ?? 'unknown',
            url: a.url,
            contentType: a.contentType ?? undefined
        }));
        await this.handleFileUpload(dmChannelId, dmThreadId, files, text, message);
        return;
    }

    // 发送到 router
    await this.router.send({
        platform: 'discord',
        channelId: dmChannelId,
        threadId: dmThreadId,
        messageId: message.id,
        message: text,
        userId: message.author.id
    });
    return;
}
`;

const targetPattern = `// Check if this channel is bound to a project
        const project = this.store.getProjectByChannelId(channelId);`;

if (content.includes(targetPattern)) {
    content = content.replace(targetPattern, dmCode + targetPattern);
    console.log("[DM Patch]   ✓ 已添加 DM 处理逻辑");
} else {
    console.log("[DM Patch]   ✗ 未找到插入点");
    // 尝试备用模式
    const altPattern = `// Check if this channel is bound to a project
    const project = this.store.getProjectByChannelId(channelId);`;
    if (content.includes(altPattern)) {
        content = content.replace(altPattern, dmCode + altPattern);
        console.log("[DM Patch]   ✓ (备用模式) 已添加 DM 处理逻辑");
    }
}

// 保存修改后的文件
fs.writeFileSync(discordAdapterPath, content);
console.log("[DM Patch] 完成！");
console.log("[DM Patch] 请重启 OpenBridge 测试 DM 功能");
