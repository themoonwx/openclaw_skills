# 飞书 Tracker 集成 Skill

## 作用
将飞书消息追踪功能集成到 OpenClaw，当机器人发送或回复消息时，自动记录到 tracker 文件。V4 提醒服务会检测 tracker 中超过 10 秒未读的消息，发送加急提醒通知。

## 功能
- 发送消息时自动写入 tracker 文件
- 回复消息时自动写入 tracker 文件
- V4 提醒服务根据 tracker 检测未读并提醒

## 文件结构
feishu-tracker/
├── SKILL.md       # 本文档
├── install.sh     # 首次安装脚本
├── patch-code.js  # 代码补丁参考
└── deploy.sh      # 重新部署脚本

## 使用方法

### 首次安装（创建 tracker 文件和 systemd 服务）
~/.claude/skills/feishu-tracker/install.sh

### 重新部署（修改代码后重新构建和重启）
~/.claude/skills/feishu-tracker/deploy.sh

## 依赖
- OpenClaw 飞书扩展
- Node.js
- systemd
- 飞书机器人 APP_ID / APP_SECRET

## 配置路径
- Tracker 文件: /home/ubuntu/.openclaw/message_tracker.json
- 服务日志: /home/ubuntu/.openclaw/workspace/v4_reminder.log

## 测试
1. 在飞书给机器人发消息
2. 机器人自动回复
3. 等待 10 秒，如果消息未读会收到加急提醒通知

## 排查命令
# 查看服务状态
sudo systemctl status v4-reminder

# 实时查看日志
tail -f ~/.openclaw/workspace/v4_reminder.log

# 查看 tracker 文件内容
cat ~/.openclaw/message_tracker.json

