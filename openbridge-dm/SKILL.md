# OpenBridge Discord DM/群聊支持 Skill

## 状态
- ✅ 群聊 (Group DM) - 可正常工作
- ⚠️ 私信 (DM) - Discord 限制，暂不可用

## 已完成的修复
1. 添加 DirectMessages Gateway Intent
2. 群聊消息处理逻辑

## 使用方法
1. 应用补丁: node ~/.claude/skills/openbridge-dm/patch-dm-v3.js
2. 启动: cd ~/.openbridge-ai && nohup proxychains4 /home/ubuntu/.npm-global/bin/openbridge-ai start > ~/.openbridge-ai/daemon.log 2>&1 &

## 群聊测试
在 Discord 新建群聊，添加 OpenBridge 机器人，可以正常对话。

## 私信问题
Discord 限制机器人接收私信消息，需要满足：
1. 用户和机器人在同一服务器
2. 用户在服务器与机器人有过互动
3. 可能有额外的政策限制

## 备份
原版文件: ~/.npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js.bak
