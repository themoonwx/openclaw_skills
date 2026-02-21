---
name: feishu-reminder
description: 飞书智能消息提醒 - 自动跟踪消息已读状态，未读时发送加急提醒。适用于需要确保重要消息被及时阅读的场景。
---

# 飞书智能消息提醒

一个智能的飞书消息跟踪和提醒系统，确保重要消息被及时阅读。

## 功能特性

### 1. 自动消息跟踪
- 自动跟踪所有发送的消息
- 记录消息发送时间
- 检测消息已读状态

### 2. 智能未读提醒
- 可配置提醒阈值（默认1分钟）
- 自动判断是否需要提醒
- 避免重复提醒

### 3. 消息加急推送
- 支持 `[URGENT]`、`[紧急]`、`[重要]` 标记
- 加急消息立即触发推送
- 适用于紧急通知

### 4. 多用户支持
- 支持多个用户独立跟踪
- 每个用户消息独立管理
- 管理员集中控制

## 安装

```bash
# 安装依赖
npm install axios uuid

# 或使用独立脚本
cp feishu-reminder.js ~/scripts/
```

## 使用方法

### 启动提醒服务

```bash
# 以后台模式启动
node feishu-reminder.js start

# 或使用 systemd 服务
sudo cp feishu-reminder.service /etc/systemd/system/
sudo systemctl enable feishu-reminder
sudo systemctl start feishu-reminder
```

### 发送消息

```bash
# 普通消息（自动跟踪，未读会提醒）
curl -X POST "http://localhost:3000/send" \
  -H "Content-Type: application/json" \
  -d '{"userId": "ou_xxx", "content": "消息内容"}'

# 加急消息（立即推送）
curl -X POST "http://localhost:3000/send" \
  -H "Content-Type: application/json" \
  -d '{"userId": "ou_xxx", "content": "[URGENT] 紧急消息"}'
```

### 消息标记

| 标记 | 效果 |
|------|------|
| `[URGENT]` | 立即加急推送 |
| `[紧急]` | 立即加急推送 |
| `[重要]` | 立即加急推送 |

普通消息发送后会自动跟踪，1分钟未读则发送提醒。

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `FEISHU_APP_ID` | 飞书应用 ID | - |
| `FEISHU_APP_SECRET` | 飞书应用密钥 | - |
| `REMINDER_INTERVAL` | 提醒间隔(秒) | 60 |
| `PORT` | 服务端口 | 3000 |

### 配置文件

```json
{
  "reminderThreshold": 60000,
  "enabled": true,
  "users": {
    "ou_xxx": {
      "enabled": true,
      "reminderThreshold": 60000
    }
  }
}
```

## 数据文件

- `message_tracker.json` - 消息跟踪记录
- `todo_reminder_data.json` - 提醒状态记录

## API 接口

### 发送消息
```
POST /send
{
  "userId": "ou_xxx",
  "content": "消息内容"
}
```

### 获取消息状态
```
GET /status/:messageId
```

### 健康检查
```
GET /health
```

## systemd 服务配置

```ini
[Unit]
Description=Feishu Reminder Service
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu
ExecStart=/usr/bin/node /home/ubuntu/.openclaw/workspace/standalone_reminder_v3.js start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## 工作流程

```
1. 发送消息
   ↓
2. 消息加入跟踪队列
   ↓
3. 定时检查（每30秒）
   ├─ 已读 → 停止跟踪
   └─ 未读超过阈值 → 发送提醒
            ↓
       提醒发送加急消息
```

## 故障排查

### 消息未发送
- 检查飞书应用权限
- 验证 App ID 和 Secret

### 提醒不生效
- 检查提醒服务是否运行
- 查看日志文件

### 已读检测失败
- 确认应用有 im:message:read_users 权限

## 许可证

MIT
