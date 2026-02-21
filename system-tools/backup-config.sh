#!/bin/bash
# 配置备份脚本
# 功能：自动备份配置文件，保留最近10个备份

CONFIG_DIR="$HOME/.openclaw"
BACKUP_DIR="$CONFIG_DIR/configs/backup"
CONFIG_FILE="$CONFIG_DIR/openclaw.json"

# 创建带时间戳的备份
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

# 检查配置文件是否存在
if [ ! -f "$CONFIG_FILE" ]; then
    echo "Config file not found: $CONFIG_FILE"
    exit 1
fi

# 执行备份
cp "$CONFIG_FILE" "$BACKUP_DIR/config.$TIMESTAMP.bak"

# 只保留最近10个备份
cd "$BACKUP_DIR"
if [ $(ls -1 config.*.bak 2>/dev/null | wc -l) -gt 10 ]; then
    ls -t config.*.bak | tail -n +11 | xargs -r rm
fi

echo "Backup created: config.$TIMESTAMP.bak"
