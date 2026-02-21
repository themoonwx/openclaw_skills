#!/bin/bash
# 健康检查脚本
# 功能：检查 Gateway 进程、端口响应、配置有效性、磁盘空间、内存、任务队列
# 特性：用 awk 替代 bc，检测到错误时发送飞书告警

ERRORS=0

# 飞书告警配置
FEISHU_WEBHOOK_URL="${FEISHU_WEBHOOK:-}"

# 告警函数
send_alert() {
    local message="$1"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    # 记录到日志
    echo "[ALERT] $timestamp - $message" >> /var/log/openclaw/alert.log
    
    # 发送飞书告警（如果配置了 webhook）
    if [ -n "$FEISHU_WEBHOOK_URL" ]; then
        curl -s -X POST "$FEISHU_WEBHOOK_URL" \
            -H "Content-Type: application/json" \
            -d "{\"msg_type\":\"text\",\"content\":{\"text\":\"[OpenClaw告警] $message\n时间: $timestamp\"}}" \
            > /dev/null 2>&1
    fi
}

echo "=== OpenClaw Health Check ==="
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# 1. 检查 Gateway 进程
if ! pgrep -f "openclaw-gateway" > /dev/null 2>&1; then
    echo "❌ Gateway process not running"
    ERRORS=$((ERRORS + 1))
    send_alert "Gateway 进程未运行"
else
    echo "✅ Gateway running"
fi

# 2. 检查端口响应
if curl -s --connect-timeout 5 http://127.0.0.1:18789/api/status > /dev/null 2>&1; then
    echo "✅ Gateway API responding"
else
    echo "❌ Gateway API not responding"
    ERRORS=$((ERRORS + 1))
    send_alert "Gateway API 无响应"
fi

# 3. 检查配置有效性
if ! jq empty "$HOME/.openclaw/openclaw.json" 2>/dev/null; then
    echo "❌ Config invalid"
    ERRORS=$((ERRORS + 1))
    send_alert "配置文件 JSON 格式无效"
else
    echo "✅ Config valid"
fi

# 4. 检查磁盘空间
DISK_USAGE=$(df -h "$HOME" | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "❌ Disk usage high: ${DISK_USAGE}%"
    ERRORS=$((ERRORS + 1))
    send_alert "磁盘使用率过高: ${DISK_USAGE}%"
else
    echo "✅ Disk OK: ${DISK_USAGE}%"
fi

# 5. 检查内存 (用 awk 替代 bc)
MEM_USAGE=$(free | grep Mem | awk '{printf "%.0f", ($3/$2) * 100}')
if [ "$MEM_USAGE" -gt 90 ]; then
    echo "❌ Memory usage high: ${MEM_USAGE}%"
    ERRORS=$((ERRORS + 1))
    send_alert "内存使用率过高: ${MEM_USAGE}%"
else
    echo "✅ Memory OK: ${MEM_USAGE}%"
fi

# 6. 检查任务队列（处理中超时）
TIMEOUT_TASKS=$(jq '[.processing[] | select((.timestamp // 0) < now - 3600)] | length' \
    "$HOME/.openclaw/data/task-queue.json" 2>/dev/null || echo 0)
if [ "$TIMEOUT_TASKS" -gt 0 ]; then
    echo "⚠️  $TIMEOUT_TASKS timeout tasks found, recovering..."
    # 自动恢复
    ~/scripts/task-queue.sh recover
fi

# 返回状态
if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "❌ Found $ERRORS errors!"
    exit 1
else
    echo ""
    echo "✅ All checks passed!"
    exit 0
fi
