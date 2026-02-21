#!/bin/bash
# 配置校验脚本
# 功能：校验 JSON 格式，无效时自动回滚到最近的有效备份

CONFIG_FILE="$HOME/.openclaw/openclaw.json"
BACKUP_DIR="$HOME/.openclaw/configs/backup"

# 校验 JSON 格式
if ! jq empty "$CONFIG_FILE" 2>/dev/null; then
    echo "Config is invalid JSON!"
    
    # 找到最新的有效备份
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/config.*.bak 2>/dev/null | head -1)
    
    if [ -n "$LATEST_BACKUP" ]; then
        echo "Restoring from: $LATEST_BACKUP"
        cp "$LATEST_BACKUP" "$CONFIG_FILE"
        echo "Config restored!"
    else
        echo "No backup found!"
        exit 1
    fi
else
    echo "Config is valid."
    exit 0
fi
