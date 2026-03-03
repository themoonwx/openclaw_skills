#!/bin/bash
# 飞书 tracker 集成安装脚本

set -e

echo === 飞书 Tracker 集成安装 ===

# 1. 创建 tracker 文件
TRACKER_FILE="/home/ubuntu/.openclaw/message_tracker.json"
if [ ! -f "$TRACKER_FILE" ]; then
    echo '{}' > "$TRACKER_FILE"
    echo "✓ 创建 tracker 文件: $TRACKER_FILE"
fi

# 2. 创建 v4-reminder 服务
cat > /tmp/v4-reminder.service << 'SERVICE_EOF'
[Unit]
Description=V4飞书消息提醒服务
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/.openclaw/workspace
ExecStart=/usr/bin/node /home/ubuntu/.openclaw/workspace/standalone_reminder_v3.js start
Restart=always
RestartSec=10
StandardOutput=append:/home/ubuntu/.openclaw/workspace/v4_reminder.log
StandardError=append:/home/ubuntu/.openclaw/workspace/v4_reminder.log

[Install]
WantedBy=multi-user.target
SERVICE_EOF

sudo cp /tmp/v4-reminder.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable v4-reminder

echo "✓ 创建 v4-reminder 服务"

# 3. 启动服务
sudo systemctl start v4-reminder

echo "✓ 启动提醒服务"

echo ""
echo "=== 安装完成 ==="
echo "tracker 文件: $TRACKER_FILE"
echo "日志: ~/.openclaw/workspace/v4_reminder.log"
echo ""
echo "测试方法：在飞书给机器人发消息，等待回复，10秒后未读会收到提醒"
