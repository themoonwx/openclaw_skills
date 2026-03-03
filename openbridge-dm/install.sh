#!/bin/bash
# OpenBridge Discord DM 支持安装脚本

set -e

echo === OpenBridge Discord DM 支持安装 ===

# 1. 备份原文件
echo "1/3 备份原 Discord 适配器..."
cp ~/.npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js \
   ~/.npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js.bak
echo "  ✓ 已备份"

# 2. 应用补丁
echo "2/3 应用 DM 补丁..."
node ~/.claude/skills/openbridge-dm/patch-discord.js

# 3. 创建启动脚本
echo "3/3 创建启动脚本..."
cat > ~/.openbridge-ai/start-dm.sh << 'EOF'
#!/bin/bash
cd ~/.openbridge-ai
source .env.local

# 设置代理
export ALL_PROXY="http://127.0.0.1:1081"

# 关闭原有的
pkill -f "openbridge-ai start" 2>/dev/null || true

# 启动 DM 版本
nohup proxychains4 -f /etc/proxychains4.conf \
    /home/ubuntu/.npm-global/bin/openbridge-ai start > ~/.openbridge-ai/dm.log 2>&1 &

echo "OpenBridge DM 版本已启动"
echo "日志: ~/.openbridge-ai/dm.log"
EOF
chmod +x ~/.openbridge-ai/start-dm.sh
echo "  ✓ 已创建 start-dm.sh"

echo ""
echo === 安装完成 ===
echo ""
echo "启动 DM 版本: ~/.openbridge-ai/start-dm.sh"
echo "恢复原版: cp ~/.npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js.bak ~/.npm-global/lib/node_modules/openbridge-ai/dist/adapters/discord.js"
