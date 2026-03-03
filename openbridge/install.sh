#\!/bin/bash
# OpenBridge 代理集成一键安装脚本

set -e

echo === OpenBridge 代理集成安装 ===

# 1. 备份并配置 proxychains 本地网络排除
echo "1/4 配置 proxychains 本地网络排除..."
if \! grep -q "localnet 127.0.0.0/255.0.0.0" /etc/proxychains4.conf; then
    sudo sed -i "/RFC6890 Loopback/a localnet 127.0.0.0/255.0.0.0" /etc/proxychains4.conf
    sudo sed -i "/::1\/128/a localnet ::1/128" /etc/proxychains4.conf
    echo "  ✓ 添加本地网络排除"
else
  ✓ 已配置跳过"
fi

# 2. 部署修复后的 monitor.sh
echo "2/4 部署 monitor.sh..."
cp ~/.claude/skills/openbridge/monitor.sh ~/.openbridge-ai/monitor.sh
chmod +x ~/.openbridge-ai/monitor.sh
echo "  ✓ monitor.sh 已更新"

# 3. 部署 LiteLLM 配置
echo "3/4 部署 LiteLLM 配置..."
if [ -f ~/.claude/skills/openbridge/litellm.yaml ]; then
    cp ~/litellm/config.yaml ~/litellm/config.yaml.bak 2>/dev/null || true
    cp ~/.claude/skills/openbridge/litellm.yaml ~/litellm/config.yaml
    echo "  ✓ LiteLLM 配置已更新"
fi

# 4. 启动监控
echo "4/4 启动 monitor.sh..."
pkill -f "monitor.sh" 2>/dev/null || true
nohup ~/.openbridge-ai/monitor.sh > /dev/null 2>&1 &
sleep 1
echo "  ✓ monitor.sh 已启动"

echo ""
echo "=== 安装完成 ==="
echo "测试: 在 Discord 发消息，Claude Code 应该能正常回复"

echo "排查命令:"
echo "  tail -f ~/.openbridge-ai/daemon.log"
echo "  ps aux | grep openbridge"
