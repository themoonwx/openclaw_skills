#\!/bin/bash

LOG="/home/ubuntu/.openbridge-ai/daemon.log"

check() {
    # 检测 openbridge-ai 进程是否存在
    if pgrep -f "openbridge-ai start" > /dev/null 2>&1; then
        return 0
    else
        echo "[Tue Mar  3 03:22:28 PM CST 2026] OpenBridge died, restarting..." >> ""
        cd /home/ubuntu/.openbridge-ai
        
        # 设置Claude API环境变量
        export ANTHROPIC_BASE_URL=https://api.minimaxi.com/anthropic
        export ANTHROPIC_AUTH_TOKEN=sk-cp-ebYeOE0mA-4SjJh6qLeN4faa2sr09kdOvGeL3CXI2l_BjMxr3i0aDO02LSNyScuKThOOat5lmIjBL7-qIvyxNZ1KV74RvpdmPtGttEooSzx6I4sdCDKhAa4
        export ANTHROPIC_MODEL=MiniMax-M2.5
        
        # 排除代理：本地服务、MiniMax API
        export NO_PROXY=localhost,127.0.0.1,127.0.0.1:4000,api.minimaxi.com
        
        # 使用proxychains代理Discord连接
        nohup proxychains4 /home/ubuntu/.npm-global/bin/openbridge-ai start >> "" 2>&1 &
        sleep 3
    fi
}

check
while true; do
    sleep 30
    check
done
