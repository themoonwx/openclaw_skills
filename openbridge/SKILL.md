# OpenBridge 代理集成 Skill

## 作用
在国内服务器上通过代理连接 Discord 与 Claude Code

## 问题背景
国内服务器无法直接访问 Discord，需要通过代理
原问题：proxychains 代理了本地 LiteLLM 请求，导致死循环

## 修复内容

1. **proxychains 本地网络排除**
   - 原因：proxychains 会代理所有流量，包括本地 LiteLLM
   - 解决：在 /etc/proxychains4.conf 添加:
     localnet 127.0.0.0/255.0.0.0
     localnet ::1/128

2. **monitor.sh 进程检测修复**
   - 原因：原检测 proxychains 会误判为运行中
   - 解决：改为检测 openbridge-ai start

3. **LiteLLM 模型映射**
   - 原因：OpenBridge 使用的模型名与配置不匹配
   - 解决：config.yaml 添加模型别名

## 代理配置说明

### HTTP 代理 (推荐)
- 端口: 1080 / 1081
- 配置: ALL_PROXY=http://127.0.0.1:1081
- 使用场景: 简单稳定

### TUN 模式 (更稳定)
- 原理: 透明代理，不需要应用配置
- 开启后自动代理所有流量
- 优势: 不需要配置 NO_PROXY

### 代理端口说明
- 1080: 可能已开放
- 1081: Xray 备用端口

## 使用方法

### 一键部署
./install.sh

### 手动部署

1. 配置 proxychains:
   sudo nano /etc/proxychains4.conf
   # 在 [ProxyList] 前添加:
   localnet 127.0.0.0/255.0.0.0
   localnet ::1/128

2. 配置 LiteLLM:
   # 添加模型别名 (见 litellm.yaml)

3. 启动 monitor.sh:
   nohup ~/.openbridge-ai/monitor.sh &

## 文件结构
openbridge/
├── SKILL.md       # 本文档
├── install.sh     # 一键安装
├── monitor.sh     # 监控脚本
└── litellm.yaml  # LiteLLM配置

## 排查命令

# 测试代理连通性
curl -x http://127.0.0.1:1081 https://discord.com --connect-timeout 5

# 查看进程
ps aux | grep openbridge

# 查看日志
tail -f ~/.openbridge-ai/daemon.log

# 查看 monitor 日志
cat ~/.openbridge-ai/monitor.log

# 重启服务
pkill -f "openbridge-ai start"; nohup ~/.openbridge-ai/monitor.sh &
